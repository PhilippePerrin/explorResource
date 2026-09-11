import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import {
  AlertTriangle,
  Ban,
  Circle,
  CircleDot,
  Download,
  FileText,
  Settings2,
  Trash2,
  UploadCloud,
} from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, IconChip, Tabs } from '@/components/ui';
import type { AppSettings } from '@/domain/entities';
import { restoreBackup, validateBackup, type BackupFile } from '@/persistence/backup';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useThemePreference } from '@/theme/useThemePreference';
import { useBackupExport } from '@/app/useBackupExport';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

import {
  applySettingsFormValues,
  createSettingsFormValues,
  parsePercentageInput,
  resolveAppSettings,
  settingsFormSchema,
  type SettingsFormValues,
} from './settingsUtils';

const appSettingsRepository = createRepository('appSettings');

interface PendingRestore {
  backup: BackupFile;
  fileName: string;
}

type ResetStage = 'confirm-reset' | 'confirm-reset-final';

function createResolver(): Resolver<SettingsFormValues> {
  return async (values) => {
    const result = settingsFormSchema.safeParse(values);

    if (result.success) {
      return {
        values: result.data,
        errors: {},
      };
    }

    const errors: Record<string, { type: string; message: string }> = {};

    for (const issue of result.error.issues) {
      const path = issue.path.join('.');

      if (!path || errors[path]) {
        continue;
      }

      errors[path] = {
        type: issue.code,
        message: issue.message,
      };
    }

    return {
      values: {},
      errors,
    };
  };
}

function getErrorSummary(errors: FieldErrors<SettingsFormValues>): string[] {
  return Object.values(errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value);
}

async function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read the selected file.'));
    };
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };

    reader.readAsText(file);
  });
}

async function readBackupFile(file: File): Promise<BackupFile> {
  const rawText = await readTextFile(file);
  return validateBackup(JSON.parse(rawText) as unknown);
}

export function SettingsPage() {
  const loadRequestIdRef = useRef(0);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const backupExport = useBackupExport();
  const [busyRestore, setBusyRestore] = useState(false);
  const [busyReset, setBusyReset] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const [resetStage, setResetStage] = useState<ResetStage | null>(null);
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(resolveAppSettings(null));
  const { preference: themePreference, updatePreference: updateThemePreference } =
    useThemePreference();

  const form = useForm<SettingsFormValues>({
    defaultValues: createSettingsFormValues(appSettings.visualThresholds),
    resolver: createResolver(),
  });

  const errorSummary = getErrorSummary(form.formState.errors);
  const hasUnsavedChanges = form.formState.isDirty;
  const currentThresholds = useMemo(
    () => createSettingsFormValues(appSettings.visualThresholds),
    [appSettings],
  );

  const loadData = useCallback(
    async (options?: { resetForm?: boolean }) => {
      const requestId = ++loadRequestIdRef.current;
      setLoading(true);

      try {
        const storedAppSettings = await appSettingsRepository.getById('app-settings');

        if (loadRequestIdRef.current !== requestId) {
          return;
        }

        const nextSettings = resolveAppSettings(storedAppSettings ?? null);
        setAppSettings(nextSettings);

        if (options?.resetForm ?? false) {
          form.reset(createSettingsFormValues(nextSettings.visualThresholds));
        }
      } finally {
        if (loadRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [form],
  );

  useEffect(() => {
    void loadData({ resetForm: true });
  }, [loadData]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (backupExport.feedback) {
      setFeedback(backupExport.feedback);
    }
  }, [backupExport.feedback]);

  async function handleSave(values: SettingsFormValues) {
    setSubmitting(true);
    setFeedback('');

    try {
      const updatedSettings = {
        ...applySettingsFormValues(appSettings, values),
        id: 'app-settings',
      } as AppSettings;

      await appSettingsRepository.put(updatedSettings);
      await loadData({ resetForm: true });
      setFeedback('Settings saved.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePrepareRestore() {
    setFeedback('');

    if (!selectedBackupFile) {
      setFeedback('Select a JSON backup file before starting a restore.');
      return;
    }

    try {
      const backup = await readBackupFile(selectedBackupFile);
      setPendingRestore({
        backup,
        fileName: selectedBackupFile.name,
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to validate the backup file.');
    }
  }

  async function handleConfirmRestore() {
    if (!pendingRestore) {
      return;
    }

    setBusyRestore(true);
    setFeedback('');

    try {
      await restoreBackup(pendingRestore.backup);
      setPendingRestore(null);
      setSelectedBackupFile(null);

      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = '';
      }

      await loadData({ resetForm: true });
      setFeedback('Backup restored. Existing data has been replaced atomically.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to restore backup.');
    } finally {
      setBusyRestore(false);
    }
  }

  async function handleConfirmReset() {
    if (!resetStage) {
      return;
    }

    if (resetStage === 'confirm-reset') {
      setResetStage('confirm-reset-final');
      return;
    }

    setBusyReset(true);
    setFeedback('');

    try {
      await deletePlannerDb();
      setResetStage(null);
      setSelectedBackupFile(null);

      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = '';
      }

      await loadData({ resetForm: true });
      setFeedback('All application data has been reset.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to reset application data.');
    } finally {
      setBusyReset(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6" id="settings-page">
      <PageHeader
        description="Configure utilization thresholds, review precision rules, and safeguard the local-first planner with validated backup, restore, and reset actions."
        icon={Settings2}
        title="Settings"
      />

      <FeedbackMessage message={feedback} />

      {hasUnsavedChanges ? (
        <p
          className="flex items-center gap-2 rounded-lg border border-[var(--color-bmx-gold)] bg-[var(--surf-800)] px-4 py-3 text-sm"
          role="status"
        >
          <AlertTriangle aria-hidden="true" size={16} strokeWidth={2.25} />
          Unsaved changes in utilization thresholds. Save before closing the tab.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(24rem,34rem)_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Utilization thresholds</h2>
            <Button
              className="underline"
              disabled={loading || submitting}
              size="sm"
              variant="ghost"
              onClick={() => {
                form.reset(currentThresholds);
              }}
            >
              Reset form
            </Button>
          </div>

          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            Thresholds mirror the four business status bands used across capacity views. Each saved
            value is mapped back to the underlying application settings structure.
          </p>

          {errorSummary.length > 0 ? (
            <div
              className="mb-4 rounded-lg border border-red-500/50 bg-red-950/20 px-4 py-3 text-sm"
              role="alert"
            >
              <p className="font-semibold">Please correct the following:</p>
              <ul className="mt-2 list-disc pl-5">
                {errorSummary.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => {
              void handleSave(values);
            })}
          >
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="available-below">
                Available below (%)
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                disabled={loading || submitting}
                id="available-below"
                inputMode="decimal"
                type="text"
                {...form.register('availableBelow', {
                  setValueAs: parsePercentageInput,
                })}
              />
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <Circle aria-hidden="true" size={12} strokeWidth={2.25} />
                Values below this threshold stay in the Available band.
              </p>
              {form.formState.errors.availableBelow ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {form.formState.errors.availableBelow.message}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="used-up-to">
                Used up to (%)
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                disabled={loading || submitting}
                id="used-up-to"
                inputMode="decimal"
                type="text"
                {...form.register('usedTo', {
                  setValueAs: parsePercentageInput,
                })}
              />
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <CircleDot aria-hidden="true" size={12} strokeWidth={2.25} />
                Values from {formatPercentage(form.watch('availableBelow') || 0)}% through this
                threshold stay in the Used band.
              </p>
              {form.formState.errors.usedTo ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {form.formState.errors.usedTo.message}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="overload-up-to">
                Overload up to (%)
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                disabled={loading || submitting}
                id="overload-up-to"
                inputMode="decimal"
                type="text"
                {...form.register('overloadTo', {
                  setValueAs: parsePercentageInput,
                })}
              />
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <AlertTriangle aria-hidden="true" size={12} strokeWidth={2.25} />
                Values above {formatPercentage(form.watch('usedTo') || 0)}% and up to this threshold
                stay in the Overload band.
              </p>
              {form.formState.errors.overloadTo ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {form.formState.errors.overloadTo.message}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="critical-above">
                Critical overload from (%)
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                disabled={loading || submitting}
                id="critical-above"
                inputMode="decimal"
                type="text"
                {...form.register('criticalAbove', {
                  setValueAs: parsePercentageInput,
                })}
              />
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <Ban aria-hidden="true" size={12} strokeWidth={2.25} />
                Values above {formatPercentage(form.watch('overloadTo') || 0)}% are critical
                overload.
              </p>
              {form.formState.errors.criticalAbove ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {form.formState.errors.criticalAbove.message}
                </p>
              ) : null}
            </div>

            <Button busy={submitting} disabled={loading || submitting} type="submit">
              {submitting ? 'Saving…' : 'Save threshold settings'}
            </Button>
          </form>
        </Card>

        <div className="grid gap-6">
          <Card>
            <h2 className="text-xl font-semibold">Appearance</h2>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Choose a theme, or follow the operating system setting.
            </p>
            <div className="mt-4">
              <Tabs
                items={THEME_OPTIONS}
                label="Theme"
                value={themePreference}
                onChange={(value) => {
                  void updateThemePreference(value as (typeof THEME_OPTIONS)[number]['value']);
                }}
              />
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold">Precision and tolerance</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4">
                <dt className="text-sm font-medium">Display precision</dt>
                <dd className="mt-2 text-sm text-[var(--text-secondary)]">
                  {appSettings.displayPrecision} decimal place
                  {appSettings.displayPrecision === 1 ? '' : 's'}. Current business rules still cap
                  visible day values at one decimal.
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4">
                <dt className="text-sm font-medium">Normalization tolerance</dt>
                <dd className="mt-2 text-sm text-[var(--text-secondary)]">
                  {appSettings.numericTolerance}. This lot exposes the current tolerance as
                  informational because the existing normalization engine still applies the global
                  default of 1e-6.
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold">Related settings</h2>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Resource-type management stays on the dedicated Resource Types page from Lot 4. This
              screen focuses on cross-cutting thresholds and data-safety actions.
            </p>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold">Backup and restore</h2>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Export writes the validated IndexedDB contents to a JSON file. Restore validates the
              selected file before replacing existing application data in one atomic transaction.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                busy={backupExport.exporting}
                onClick={() => {
                  void backupExport.triggerExport();
                }}
              >
                <Download aria-hidden="true" size={16} strokeWidth={2.25} />
                {backupExport.exporting ? 'Exporting…' : 'Export backup as JSON'}
              </Button>
            </div>

            <div className="mt-5 space-y-3 rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="backup-file">
                  Backup file (.json)
                </label>
                <input
                  accept="application/json,.json"
                  className="block w-full text-sm"
                  id="backup-file"
                  onChange={(event) => {
                    setPendingRestore(null);
                    setSelectedBackupFile(event.target.files?.[0] ?? null);
                  }}
                  ref={backupFileInputRef}
                  type="file"
                />
              </div>

              {selectedBackupFile ? (
                <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  Selected file:{' '}
                  <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                    <FileText aria-hidden="true" size={14} strokeWidth={2.25} />
                    {selectedBackupFile.name}
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <IconChip icon={UploadCloud} size="sm" tone="neutral" />
                  No backup file selected yet.
                </p>
              )}

              <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                <AlertTriangle aria-hidden="true" size={14} strokeWidth={2.25} />
                Restore replaces the current IndexedDB contents, including imports and manual
                adjustments.
              </p>

              <Button
                disabled={!selectedBackupFile}
                variant="secondary"
                onClick={() => {
                  void handlePrepareRestore();
                }}
              >
                Validate and restore backup
              </Button>
            </div>
          </Card>

          <Card className="border-[var(--status-critical-border)]">
            <h2 className="text-xl font-semibold">Reset application data</h2>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Use this only when you intentionally want to wipe the local application database.
              Reset requires two confirmations and cannot be undone.
            </p>
            <Button
              busy={busyReset}
              className="mt-4"
              disabled={busyReset}
              variant="danger"
              onClick={() => {
                setResetStage('confirm-reset');
              }}
            >
              <Trash2 aria-hidden="true" size={16} strokeWidth={2.25} />
              Reset app data
            </Button>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        busy={busyRestore}
        cancelLabel="Keep current data"
        confirmLabel="Restore and replace data"
        description={
          <div className="space-y-2">
            <p>
              Restore will replace the current application data with the contents of{' '}
              <strong>{pendingRestore?.fileName}</strong>.
            </p>
            <p>
              Exported at: <strong>{pendingRestore?.backup.exportedAt ?? 'Unknown'}</strong>
            </p>
            <p>
              Backup format:{' '}
              <strong>{pendingRestore?.backup.backupFormatVersion ?? 'Unknown'}</strong>
              {' · '}
              Schema: <strong>{pendingRestore?.backup.schemaVersion ?? 'Unknown'}</strong>
            </p>
            <p className="flex items-center gap-1.5">
              <AlertTriangle aria-hidden="true" size={14} strokeWidth={2.25} />
              Existing data will be replaced atomically.
            </p>
          </div>
        }
        onCancel={() => {
          setPendingRestore(null);
        }}
        onConfirm={handleConfirmRestore}
        open={pendingRestore !== null}
        title="Confirm backup restore"
        tone="danger"
      />

      <ConfirmDialog
        busy={busyReset}
        cancelLabel="Cancel reset"
        confirmLabel="Continue reset"
        description={
          <div className="space-y-2">
            <p className="flex items-center gap-1.5">
              <AlertTriangle aria-hidden="true" size={14} strokeWidth={2.25} />
              This will delete all local planner data from IndexedDB on this device.
            </p>
            <p>Use Export backup first if you may need the current state later.</p>
          </div>
        }
        onCancel={() => {
          setResetStage(null);
        }}
        onConfirm={handleConfirmReset}
        open={resetStage === 'confirm-reset'}
        title="First confirmation required"
        tone="danger"
      />

      <ConfirmDialog
        busy={busyReset}
        cancelLabel="Go back"
        confirmLabel="Delete all app data"
        description={
          <div className="space-y-2">
            <p>Final confirmation: this action permanently wipes the planner database.</p>
            <p className="flex items-center gap-1.5">
              <AlertTriangle aria-hidden="true" size={14} strokeWidth={2.25} />
              There is no undo after this second confirmation.
            </p>
          </div>
        }
        onCancel={() => {
          setResetStage(null);
        }}
        onConfirm={handleConfirmReset}
        open={resetStage === 'confirm-reset-final'}
        title="Final reset confirmation"
        tone="danger"
      />
    </div>
  );
}
