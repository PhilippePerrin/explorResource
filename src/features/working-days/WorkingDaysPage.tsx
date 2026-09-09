import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import { CalendarDays } from '@/components/icons';
import type { WorkingDaysCalendar } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button, Card, IconChip, Skeleton, TableShell } from '@/components/ui';

import {
  MONTH_LABELS,
  calculateWorkingDaysTotal,
  createWorkingDaysFormValues,
  createWorkingDaysMutationPayload,
  duplicateWorkingDaysToNextYear,
  parseLocaleNumber,
  workingDaysFormSchema,
  type WorkingDaysFormValues,
} from './workingDaysModel';

const workingDaysRepository = createRepository('workingDaysCalendars');

function createZodResolver(): Resolver<WorkingDaysFormValues> {
  return async (values) => {
    const result = workingDaysFormSchema.safeParse(values);

    if (result.success) {
      return { values: result.data, errors: {} };
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

    return { values: {}, errors };
  };
}

function getErrorMessages(errors: FieldErrors<WorkingDaysFormValues>): string[] {
  const monthErrors = Array.isArray(errors.months) ? errors.months : [];

  return [
    ...Object.values(errors)
      .map((error) => (Array.isArray(error) ? undefined : error?.message))
      .filter((message): message is string => Boolean(message)),
    ...monthErrors
      .map((error) => error?.message)
      .filter((message): message is string => Boolean(message)),
  ];
}

export function WorkingDaysPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearEntries, setYearEntries] = useState<WorkingDaysCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [feedback, setFeedback] = useState('');

  const form = useForm<WorkingDaysFormValues>({
    defaultValues: createWorkingDaysFormValues(selectedYear, []),
    resolver: createZodResolver(),
  });

  const loadYear = useCallback(
    async (year: number) => {
      setLoading(true);

      try {
        const entries = await workingDaysRepository.getByIndex('by-year', year);
        entries.sort((left, right) => left.month - right.month);
        setYearEntries(entries);
        form.reset(createWorkingDaysFormValues(year, entries));
      } finally {
        setLoading(false);
      }
    },
    [form],
  );

  useEffect(() => {
    void loadYear(selectedYear);
  }, [loadYear, selectedYear]);

  async function handleSave(values: WorkingDaysFormValues) {
    setSaving(true);
    setFeedback('');

    try {
      const timestamp = new Date().toISOString();
      const payload = createWorkingDaysMutationPayload(values, yearEntries, timestamp);
      await Promise.all(payload.map((entry) => workingDaysRepository.put(entry)));
      setYearEntries(payload);
      setFeedback(`Working days saved for ${values.year}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save working days.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    const values = form.getValues();
    const targetYear = selectedYear + 1;

    setDuplicating(true);
    setFeedback('');

    try {
      const targetEntries = await workingDaysRepository.getByIndex('by-year', targetYear);
      const timestamp = new Date().toISOString();
      const duplicated = duplicateWorkingDaysToNextYear(
        values,
        targetYear,
        targetEntries,
        timestamp,
      );
      await Promise.all(duplicated.map((entry) => workingDaysRepository.put(entry)));
      setShowDuplicateDialog(false);
      setSelectedYear(targetYear);
      setFeedback(`Working days duplicated from ${selectedYear} to ${targetYear}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to duplicate working days.');
    } finally {
      setDuplicating(false);
    }
  }

  const watchedMonths = form.watch('months');
  const annualTotal = useMemo(
    () => calculateWorkingDaysTotal(watchedMonths ?? Array.from({ length: 12 }, () => 0)),
    [watchedMonths],
  );
  const errorMessages = getErrorMessages(form.formState.errors);

  return (
    <div className="flex w-full flex-col gap-6 p-6" id="working-days-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="relative flex items-start gap-3 overflow-hidden rounded-2xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full opacity-25 blur-3xl"
            style={{
              background:
                'linear-gradient(135deg, var(--color-bmx-blue) 0%, var(--color-bmx-cyan) 100%)',
            }}
          />
          <IconChip className="relative" icon={CalendarDays} size="lg" tone="accent" />
          <div className="relative space-y-2">
            <h1 className="text-3xl font-semibold">Working Days</h1>
            <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
              Maintain the annual January–December working-day calendar. Use the duplicate action to
              seed next year before adjusting month-specific values.
            </p>
          </div>
        </div>
      </header>

      <FeedbackMessage message={feedback} />

      <Card>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedYear((year) => year - 1)}
            >
              Previous year
            </Button>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="working-days-year">
                Year
              </label>
              <input
                className="w-32 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="working-days-year"
                inputMode="numeric"
                type="text"
                value={selectedYear}
                onChange={(event) => {
                  const nextYear = Number(event.target.value);

                  if (Number.isInteger(nextYear)) {
                    setSelectedYear(nextYear);
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedYear((year) => year + 1)}
            >
              Next year
            </Button>
          </div>

          <Button size="sm" variant="secondary" onClick={() => setShowDuplicateDialog(true)}>
            Duplicate to next year
          </Button>
        </div>

        {errorMessages.length > 0 ? (
          <div
            className="mb-4 rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm"
            role="alert"
          >
            <p className="font-semibold">Please correct the following:</p>
            <ul className="mt-2 list-disc pl-5">
              {errorMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {loading ? (
          <Skeleton label="Loading calendar…" lines={4} />
        ) : (
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((values) => {
              void handleSave(values);
            })}
          >
            <TableShell caption="Working days per month for the selected year." zebra>
              <thead>
                <tr className="border-b border-[var(--surf-divider)]">
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Month
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Working days
                  </th>
                </tr>
              </thead>
              <tbody>
                {MONTH_LABELS.map((monthLabel, index) => (
                  <tr className="border-b border-[var(--surf-divider)]" key={monthLabel}>
                    <th className="px-3 py-3 font-medium" scope="row">
                      {monthLabel}
                    </th>
                    <td className="px-3 py-3">
                      <label className="sr-only" htmlFor={`working-days-month-${index + 1}`}>
                        {monthLabel} working days
                      </label>
                      <input
                        className="w-28 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                        id={`working-days-month-${index + 1}`}
                        inputMode="decimal"
                        type="text"
                        {...form.register(`months.${index}` as const, {
                          setValueAs: parseLocaleNumber,
                        })}
                      />
                      {Array.isArray(form.formState.errors.months) &&
                      form.formState.errors.months[index] ? (
                        <p className="mt-1 text-sm text-red-400" role="alert">
                          {form.formState.errors.months[index]?.message}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th className="px-3 py-3 text-base font-semibold" scope="row">
                    Annual total
                  </th>
                  <td className="px-3 py-3 text-base font-semibold">{annualTotal}</td>
                </tr>
              </tfoot>
            </TableShell>

            <Button busy={saving} type="submit">
              {saving ? 'Saving…' : 'Save calendar'}
            </Button>
          </form>
        )}
      </Card>

      <ConfirmDialog
        busy={duplicating}
        confirmLabel="Duplicate year"
        description={
          <p>
            Copy the 12 monthly values from {selectedYear} into {selectedYear + 1}. Existing values
            for {selectedYear + 1} will be overwritten.
          </p>
        }
        onCancel={() => setShowDuplicateDialog(false)}
        onConfirm={handleDuplicate}
        open={showDuplicateDialog}
        title="Duplicate working days to next year"
      />
    </div>
  );
}
