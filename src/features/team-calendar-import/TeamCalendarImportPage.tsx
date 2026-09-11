import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FeedbackMessage } from '@/components/FeedbackMessage';
import { FileSpreadsheet } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, EmptyState, Skeleton, TableShell } from '@/components/ui';
import type { ImportBatch, Resource } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';
import {
  commitTeamCalendarAnalysis,
  createTeamCalendarImportReportBlob,
  createTeamCalendarImportWorkerClient,
  generateTeamCalendarImportReportMarkdown,
  hasBlockingAnomalies,
  initialTeamCalendarImportWizardState,
  teamCalendarImportWizardReducer,
  TEAM_CALENDAR_IMPORT_WIZARD_STEPS,
  type TeamCalendarImportWorkerClient,
} from '@/teamCalendarImport';

const resourcesRepository = createRepository('resources');
const importBatchesRepository = createRepository('importBatches');

interface TeamCalendarImportPageProps {
  workerClientFactory?: () => TeamCalendarImportWorkerClient;
}

interface TeamCalendarImportPageData {
  resources: Resource[];
  importBatches: ImportBatch[];
}

const MONTH_SHORT_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  return new Response(file).arrayBuffer();
}

export function TeamCalendarImportPage({
  workerClientFactory = createTeamCalendarImportWorkerClient,
}: TeamCalendarImportPageProps) {
  const [data, setData] = useState<TeamCalendarImportPageData>({
    resources: [],
    importBatches: [],
  });
  const [wizardState, dispatch] = useReducer(
    teamCalendarImportWizardReducer,
    initialTeamCalendarImportWizardState,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const loadRequestIdRef = useRef(0);
  const workerClient = useMemo(() => workerClientFactory(), [workerClientFactory]);
  const blockingAnomalies = hasBlockingAnomalies(wizardState);

  const importHistory = useMemo(
    () =>
      [...data.importBatches]
        .filter((batch) => batch.kind === 'non-working-days')
        .sort((left, right) => right.importedAt.localeCompare(left.importedAt)),
    [data.importBatches],
  );

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    return () => {
      workerClient.dispose();
    };
  }, [workerClient]);

  async function loadData() {
    setLoading(true);
    const requestId = ++loadRequestIdRef.current;

    try {
      const [resources, importBatches] = await Promise.all([
        resourcesRepository.getAll(),
        importBatchesRepository.getAll(),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({ resources, importBatches });
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  async function handleAnalyzeFile() {
    if (!selectedFile) {
      setFeedback('Select an Excel workbook before starting the analysis.');
      return;
    }

    setFeedback('');
    dispatch({ type: 'analysis-started' });

    try {
      const fileBuffer = await readFileBuffer(selectedFile);
      const analysis = await workerClient.analyzeFile({
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileBuffer,
        resources: data.resources.map((resource) => ({
          id: resource.id,
          firstName: resource.firstName,
          lastName: resource.lastName,
          status: resource.status,
        })),
        existingImportBatches: data.importBatches.map((batch) => ({
          id: batch.id,
          fileName: batch.fileName,
          fileSha256: batch.fileSha256,
          importedAt: batch.importedAt,
          referenceDate: batch.referenceDate,
          status: batch.status,
        })),
      });

      dispatch({ type: 'analysis-succeeded', analysis });
      setFeedback(`Technical analysis completed for "${selectedFile.name}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to analyze the workbook.';
      dispatch({ type: 'analysis-failed', message });
      setFeedback(message);
    }
  }

  async function handleCommitImport() {
    if (!wizardState.analysis) {
      return;
    }

    setSubmitting(true);
    setFeedback('');
    dispatch({ type: 'commit-started' });

    try {
      const commitResult = await commitTeamCalendarAnalysis({
        analysis: wizardState.analysis,
        note: wizardState.note.trim() || undefined,
      });
      const reportMarkdown = generateTeamCalendarImportReportMarkdown({
        analysis: wizardState.analysis,
        commitResult,
      });

      dispatch({ type: 'commit-succeeded', commitResult, reportMarkdown });
      await loadData();
      setFeedback(
        `Non-working days import committed successfully as batch ${commitResult.importBatch.id}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to commit the non-working days import.';
      dispatch({ type: 'commit-failed', message });
      setFeedback(message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetWizard() {
    dispatch({ type: 'reset' });
    setSelectedFile(null);
    setShowCancelDialog(false);
    setFeedback('');
  }

  function handleDownloadReport() {
    if (!wizardState.reportMarkdown) {
      return;
    }

    const blob = createTeamCalendarImportReportBlob(wizardState.reportMarkdown);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${wizardState.analysis?.fileName ?? 'team-calendar-import-report'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function renderStepContent() {
    if (wizardState.currentStepId === 'file-selection') {
      return (
        <section aria-labelledby="team-calendar-import-step-file-selection" className="space-y-4">
          <h2 className="text-lg font-semibold" id="team-calendar-import-step-file-selection">
            1. File selection
          </h2>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="team-calendar-import-file-input">
              Excel workbook (Team Calendar)
            </label>
            <input
              accept=".xlsx"
              className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="team-calendar-import-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                if (file) {
                  dispatch({ type: 'select-file', fileName: file.name, fileSize: file.size });
                } else {
                  dispatch({ type: 'reset' });
                }
              }}
              type="file"
            />
            {selectedFile ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Selected file: {selectedFile.name} ({selectedFile.size.toLocaleString()} bytes)
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="team-calendar-import-note-input">
              Import note
            </label>
            <textarea
              className="min-h-24 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="team-calendar-import-note-input"
              onChange={(event) => dispatch({ type: 'set-note', note: event.target.value })}
              value={wizardState.note}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              busy={wizardState.status === 'analyzing'}
              disabled={!selectedFile}
              onClick={() => {
                void handleAnalyzeFile();
              }}
            >
              {wizardState.status === 'analyzing' ? 'Analyzing…' : 'Start technical analysis'}
            </Button>
            <Button
              disabled={!selectedFile && !wizardState.analysis}
              variant="secondary"
              onClick={() => setShowCancelDialog(true)}
            >
              Cancel wizard
            </Button>
          </div>
        </section>
      );
    }

    if (!wizardState.analysis) {
      return (
        <section>
          <p className="text-sm text-[var(--text-secondary)]">
            Start with step 1 to analyze an Excel workbook.
          </p>
        </section>
      );
    }

    const { analysis } = wizardState;

    switch (wizardState.currentStepId) {
      case 'preview': {
        const sortedTotals = [...analysis.monthlyTotals].sort((left, right) => {
          if (left.resourceName !== right.resourceName) {
            return left.resourceName.localeCompare(right.resourceName);
          }
          if (left.year !== right.year) {
            return left.year - right.year;
          }
          return left.month - right.month;
        });

        return (
          <section aria-labelledby="team-calendar-import-step-preview" className="space-y-4">
            <h2 className="text-lg font-semibold" id="team-calendar-import-step-preview">
              2. Preview
            </h2>
            {analysis.duplicateOf ? (
              <p className="rounded-md border border-red-500/50 bg-red-950/20 p-3 text-sm">
                Blocking duplicate detected: same SHA-256 as {analysis.duplicateOf.fileName}
                {' imported on '}
                {formatDateTime(analysis.duplicateOf.importedAt)}.
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Resource rows in file</p>
                <p className="mt-1 text-2xl font-semibold">{analysis.statistics.resourceRows}</p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Matched resources</p>
                <p className="mt-1 text-2xl font-semibold">
                  {analysis.statistics.matchedResourceRows}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Unmatched resources</p>
                <p className="mt-1 text-2xl font-semibold">
                  {analysis.statistics.unmatchedResourceRows}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Resource/month rows to write</p>
                <p className="mt-1 text-2xl font-semibold">{analysis.monthlyTotals.length}</p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Unrecognized markings</p>
                <p className="mt-1 text-2xl font-semibold">
                  {analysis.statistics.unrecognizedMarkingCount}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Conflicting markings</p>
                <p className="mt-1 text-2xl font-semibold">
                  {analysis.statistics.conflictingMarkingCount}
                </p>
              </div>
            </div>

            <p className="text-sm text-[var(--text-secondary)]">
              Every resource/month total below <strong>replaces</strong> whatever is currently on
              the Non-working Days grid for that month. Site closures/bank holidays and
              &quot;Travelling&quot; entries are never counted.
            </p>

            <div className="max-h-96 overflow-auto rounded-lg border border-[var(--surf-divider)]">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--surf-700)]">
                  <tr>
                    <th className="px-3 py-2">Resource</th>
                    <th className="px-3 py-2">Year</th>
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2 text-right">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTotals.map((total) => (
                    <tr
                      className="border-t border-[var(--surf-divider)]"
                      key={`${total.resourceId}-${total.year}-${total.month}`}
                    >
                      <td className="px-3 py-2">{total.resourceName}</td>
                      <td className="px-3 py-2">{total.year}</td>
                      <td className="px-3 py-2">{MONTH_SHORT_LABELS[total.month - 1]}</td>
                      <td className="px-3 py-2 text-right">{total.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      }

      case 'anomaly-review':
        return (
          <section aria-labelledby="team-calendar-import-step-anomaly-review" className="space-y-4">
            <h2 className="text-lg font-semibold" id="team-calendar-import-step-anomaly-review">
              3. Anomaly review
            </h2>
            {analysis.anomalies.length === 0 ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-950/20 p-3 text-sm">
                No anomalies detected.
              </p>
            ) : (
              <div className="max-h-96 overflow-auto rounded-lg border border-[var(--surf-divider)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--surf-700)]">
                    <tr>
                      <th className="px-3 py-2">Severity</th>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Cell</th>
                      <th className="px-3 py-2">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.anomalies.map((anomaly) => (
                      <tr className="border-t border-[var(--surf-divider)]" key={anomaly.id}>
                        <td className="px-3 py-2">
                          {anomaly.severity === 'blocking' ? 'Blocking' : 'Warning'}
                        </td>
                        <td className="px-3 py-2">{anomaly.rowNumber ?? '—'}</td>
                        <td className="px-3 py-2">{anomaly.cellRef ?? '—'}</td>
                        <td className="px-3 py-2">{anomaly.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );

      case 'commit':
        return (
          <section aria-labelledby="team-calendar-import-step-commit" className="space-y-4">
            <h2 className="text-lg font-semibold" id="team-calendar-import-step-commit">
              4. Commit
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              The commit will upsert Non-working Days entries in a single atomic transaction, only
              if there are no blocking anomalies.
            </p>
            <p
              className={`rounded-md border p-3 text-sm ${
                blockingAnomalies
                  ? 'border-red-500/50 bg-red-950/20'
                  : 'border-emerald-500/40 bg-emerald-950/20'
              }`}
              role="status"
            >
              {blockingAnomalies
                ? 'Blocking anomalies detected. Resolve them before importing.'
                : 'Validation passed. Ready for atomic import.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                busy={submitting}
                disabled={blockingAnomalies}
                onClick={() => {
                  void handleCommitImport();
                }}
              >
                {submitting ? 'Importing…' : 'Commit non-working days import'}
              </Button>
              <Button variant="secondary" onClick={() => setShowCancelDialog(true)}>
                Cancel wizard
              </Button>
            </div>
          </section>
        );

      case 'final-report':
        return (
          <section aria-labelledby="team-calendar-import-step-final-report" className="space-y-4">
            <h2 className="text-lg font-semibold" id="team-calendar-import-step-final-report">
              5. Final report
            </h2>
            <p className="rounded-md border border-emerald-500/40 bg-emerald-950/20 p-3 text-sm">
              Non-working days import committed successfully. Download the Markdown report for
              audit purposes, then head to <strong>Non-working Days</strong> to review the grid.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleDownloadReport}>Download report</Button>
              <Button variant="secondary" onClick={resetWizard}>
                Start another import
              </Button>
            </div>
            {wizardState.commitResult ? (
              <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">Batch id</dt>
                  <dd className="mt-1 break-all font-mono text-sm">
                    {wizardState.commitResult.importBatch.id}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">Resource/month rows written</dt>
                  <dd className="mt-1 font-semibold">{wizardState.commitResult.upsertedMonths}</dd>
                </div>
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">Resources affected</dt>
                  <dd className="mt-1 font-semibold">
                    {wizardState.commitResult.affectedResourceCount}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">Years affected</dt>
                  <dd className="mt-1 font-semibold">
                    {wizardState.commitResult.affectedYears.join(', ') || '—'}
                  </dd>
                </div>
              </dl>
            ) : null}
          </section>
        );

      default:
        return null;
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        description={
          <>
            Read the team&apos;s Excel calendar (PTO, half-day AM/PM absences) and replace the
            matching months on the Non-working Days grid. Site closures/bank holidays and
            &quot;Travelling&quot; entries are never counted, and anything the file doesn&apos;t
            explain is flagged instead of guessed.
          </>
        }
        icon={FileSpreadsheet}
        title="Import non-working days"
      />

      <FeedbackMessage message={feedback} />
      {wizardState.errorMessage ? (
        <p className="rounded-md border border-red-500/50 bg-red-950/20 p-3 text-sm" role="alert">
          {wizardState.errorMessage}
        </p>
      ) : null}

      <Card className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Non-working days import wizard</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Five explicit steps, keyboard navigable, cancelable until commit.
          </p>
        </div>

        <ol className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {TEAM_CALENDAR_IMPORT_WIZARD_STEPS.map((step, index) => {
            const isCurrent = step.id === wizardState.currentStepId;
            const isReachable = index <= wizardState.furthestStepIndex || index === 0;

            return (
              <li key={step.id}>
                <button
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    isCurrent
                      ? 'border-[var(--color-bmx-blue)] bg-[var(--color-bmx-blue)]/10'
                      : 'border-[var(--surf-divider)]'
                  }`}
                  disabled={!isReachable}
                  onClick={() => dispatch({ type: 'go-to-step', stepId: step.id })}
                  type="button"
                >
                  <span className="block text-xs text-[var(--text-secondary)]">
                    Step {index + 1}
                  </span>
                  <span className="block font-medium">{step.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {loading ? (
          <Skeleton label="Loading reference data…" />
        ) : (
          <>
            {renderStepContent()}

            {wizardState.analysis &&
            !['commit', 'final-report'].includes(wizardState.currentStepId) ? (
              <div className="flex flex-wrap gap-3 border-t border-[var(--surf-divider)] pt-4">
                <Button
                  disabled={wizardState.currentStepId === 'preview'}
                  variant="secondary"
                  onClick={() => dispatch({ type: 'go-back' })}
                >
                  Previous step
                </Button>
                <Button onClick={() => dispatch({ type: 'go-next' })}>Next step</Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <section className="ui-shadow-sm space-y-4 rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
        <h2 className="text-xl font-semibold">Import history</h2>
        {importHistory.length === 0 ? (
          <EmptyState
            description="Committed non-working days imports will appear here with their row counts."
            icon={FileSpreadsheet}
            title="No non-working days imports yet."
          />
        ) : (
          <TableShell caption="Non-working days import history" zebra>
            <thead>
              <tr className="border-b border-[var(--surf-divider)]">
                <th className="px-3 py-2 font-semibold" scope="col">
                  Imported at
                </th>
                <th className="px-3 py-2 font-semibold" scope="col">
                  File
                </th>
                <th className="px-3 py-2 text-right font-semibold" scope="col">
                  Rows
                </th>
                <th className="px-3 py-2 font-semibold" scope="col">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {importHistory.map((batch) => (
                <tr className="border-b border-[var(--surf-divider)]" key={batch.id}>
                  <td className="px-3 py-2">{formatDateTime(batch.importedAt)}</td>
                  <td className="px-3 py-2">{batch.fileName}</td>
                  <td className="px-3 py-2 text-right">{batch.rowCount}</td>
                  <td className="px-3 py-2">{batch.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </section>

      <ConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel="Reset wizard"
        description="Canceling now discards the in-memory analysis and leaves the database untouched."
        onCancel={() => setShowCancelDialog(false)}
        onConfirm={resetWizard}
        open={showCancelDialog}
        title="Cancel non-working days import wizard?"
      />
    </div>
  );
}
