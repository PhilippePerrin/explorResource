import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ImportBatch, Resource, ResourceType } from '@/domain/entities';
import {
  buildImportComparisonSummary,
  commitImportAnalysis,
  createImportWorkerClient,
  createReportBlob,
  generateImportReportMarkdown,
  hasBlockingAnomalies,
  IMPORT_WIZARD_STEPS,
  importWizardReducer,
  initialImportWizardState,
  type ImportWorkerClient,
} from '@/import';
import { createRepository } from '@/persistence/repository';

const resourceTypesRepository = createRepository('resourceTypes');
const resourcesRepository = createRepository('resources');
const importBatchesRepository = createRepository('importBatches');
const demandSnapshotsRepository = createRepository('demandSnapshots');

interface ImportsPageProps {
  workerClientFactory?: () => ImportWorkerClient;
}

interface ImportsPageData {
  resourceTypes: ResourceType[];
  resources: Resource[];
  importBatches: ImportBatch[];
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function resolvePreviousBatch(importBatches: ImportBatch[]): ImportBatch | null {
  return (
    [...importBatches]
      .filter((batch) => batch.status === 'validated')
      .sort((left, right) => right.importedAt.localeCompare(left.importedAt))[0] ?? null
  );
}

async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  return new Response(file).arrayBuffer();
}

export function ImportsPage({ workerClientFactory = createImportWorkerClient }: ImportsPageProps) {
  const [data, setData] = useState<ImportsPageData>({
    resourceTypes: [],
    resources: [],
    importBatches: [],
  });
  const [wizardState, dispatch] = useReducer(importWizardReducer, initialImportWizardState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const loadRequestIdRef = useRef(0);
  const workerClient = useMemo(() => workerClientFactory(), [workerClientFactory]);
  const blockingAnomalies = hasBlockingAnomalies(wizardState);
  const validatedImportHistory = useMemo(
    () =>
      [...data.importBatches]
        .filter((batch) => batch.status === 'validated')
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
      const [resourceTypes, resources, importBatches] = await Promise.all([
        resourceTypesRepository.getAll(),
        resourcesRepository.getAll(),
        importBatchesRepository.getAll(),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({ resourceTypes, resources, importBatches });
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
        resourceTypes: data.resourceTypes.map((resourceType) => ({
          id: resourceType.id,
          label: resourceType.label,
          status: resourceType.status,
        })),
        resources: data.resources.map((resource) => ({
          id: resource.id,
          firstName: resource.firstName,
          lastName: resource.lastName,
          resourceTypeId: resource.resourceTypeId,
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

      const previousBatch = resolvePreviousBatch(data.importBatches);
      const previousDemandSnapshots = previousBatch
        ? await demandSnapshotsRepository.getByIndex('by-importBatchId', previousBatch.id)
        : [];
      const comparison = buildImportComparisonSummary({
        analysis,
        previousBatch: previousBatch
          ? {
              id: previousBatch.id,
              fileName: previousBatch.fileName,
              importedAt: previousBatch.importedAt,
              referenceDate: previousBatch.referenceDate,
            }
          : null,
        previousDemandSnapshots: previousDemandSnapshots.map((snapshot) => ({
          projectCode: snapshot.projectCode,
          resourceTypeId: snapshot.resourceTypeId,
          year: snapshot.year,
          month: snapshot.month,
          demandDays: snapshot.demandDays,
        })),
        resourceTypeLabelsById: new Map(
          data.resourceTypes.map((resourceType) => [resourceType.id, resourceType.label] as const),
        ),
      });

      dispatch({ type: 'analysis-succeeded', analysis, comparison });
      setFeedback(`Technical analysis completed for "${selectedFile.name}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to analyze the workbook.';
      dispatch({ type: 'analysis-failed', message });
      setFeedback(message);
    }
  }

  async function handleCommitImport() {
    if (!wizardState.analysis || !wizardState.comparison) {
      return;
    }

    setSubmitting(true);
    setFeedback('');
    dispatch({ type: 'commit-started' });

    try {
      const commitResult = await commitImportAnalysis({
        analysis: wizardState.analysis,
        note: wizardState.note.trim() || undefined,
      });
      const reportMarkdown = generateImportReportMarkdown({
        analysis: wizardState.analysis,
        comparison: wizardState.comparison,
        commitResult,
      });

      dispatch({ type: 'commit-succeeded', commitResult, reportMarkdown });
      await loadData();
      setFeedback(`Import committed successfully as batch ${commitResult.importBatch.id}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to commit the import.';
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

    const blob = createReportBlob(wizardState.reportMarkdown);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${wizardState.analysis?.fileName ?? 'import-report'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function renderStepContent() {
    switch (wizardState.currentStepId) {
      case 'file-selection':
        return (
          <section aria-labelledby="imports-step-file-selection" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-file-selection">
              1. File selection
            </h2>
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="imports-file-input">
                Excel workbook
              </label>
              <input
                accept=".xlsx"
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                id="imports-file-input"
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
              <label className="block text-sm font-medium" htmlFor="imports-note-input">
                Import note
              </label>
              <textarea
                className="min-h-24 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                id="imports-note-input"
                onChange={(event) => dispatch({ type: 'set-note', note: event.target.value })}
                value={wizardState.note}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!selectedFile || wizardState.status === 'analyzing'}
                onClick={() => {
                  void handleAnalyzeFile();
                }}
                type="button"
              >
                {wizardState.status === 'analyzing' ? 'Analyzing…' : 'Start technical analysis'}
              </button>
              <button
                className="rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm font-medium"
                disabled={!selectedFile && !wizardState.analysis}
                onClick={() => setShowCancelDialog(true)}
                type="button"
              >
                Cancel wizard
              </button>
            </div>
          </section>
        );

      case 'technical-analysis':
      case 'preview':
      case 'column-mapping':
      case 'row-classification':
      case 'anomaly-review':
      case 'comparison':
      case 'validation':
      case 'atomic-import':
      case 'final-report':
        break;
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

    switch (wizardState.currentStepId) {
      case 'technical-analysis':
        return (
          <section aria-labelledby="imports-step-technical-analysis" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-technical-analysis">
              2. Technical analysis
            </h2>
            <dl className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Worksheet</dt>
                <dd className="mt-1 font-medium">{wizardState.analysis.sheetName}</dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">SHA-256</dt>
                <dd className="mt-1 break-all font-mono text-sm">
                  {wizardState.analysis.fileSha256}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Reference date</dt>
                <dd className="mt-1 font-medium">{wizardState.analysis.referenceDate}</dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">
                  Ignored rows from NO_IMPORT*
                </dt>
                <dd className="mt-1 font-medium">
                  {wizardState.analysis.ignoredRowNumbers.length}
                </dd>
              </div>
            </dl>
            {wizardState.analysis.duplicateOf ? (
              <p className="rounded-md border border-red-500/50 bg-red-950/20 p-3 text-sm">
                Blocking duplicate detected: same SHA-256 as{' '}
                {wizardState.analysis.duplicateOf.fileName}
                {' imported on '}
                {formatDateTime(wizardState.analysis.duplicateOf.importedAt)}.
              </p>
            ) : (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-950/20 p-3 text-sm">
                Comment extraction uses SheetJS cell comments (`cellComments: true`), verified on
                the real workbook fixture.
              </p>
            )}
          </section>
        );

      case 'preview':
        return (
          <section aria-labelledby="imports-step-preview" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-preview">
              3. Preview
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Groups</p>
                <p className="mt-1 text-2xl font-semibold">{wizardState.analysis.groups.length}</p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Projects</p>
                <p className="mt-1 text-2xl font-semibold">
                  {wizardState.analysis.projects.length}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Demand snapshots</p>
                <p className="mt-1 text-2xl font-semibold">
                  {wizardState.analysis.demandSnapshots.length}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Import allocations</p>
                <p className="mt-1 text-2xl font-semibold">
                  {wizardState.analysis.allocations.length}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[var(--surf-divider)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--surf-700)]">
                  <tr>
                    <th className="px-3 py-2">Project</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2 text-right">Demand</th>
                    <th className="px-3 py-2 text-right">Supply</th>
                    <th className="px-3 py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {wizardState.analysis.demandSnapshots.slice(0, 10).map((snapshot) => (
                    <tr className="border-t border-[var(--surf-divider)]" key={snapshot.cellRef}>
                      <td className="px-3 py-2">{snapshot.projectCode}</td>
                      <td className="px-3 py-2">{snapshot.resourceTypeLabel}</td>
                      <td className="px-3 py-2">
                        {snapshot.year}-{String(snapshot.month).padStart(2, '0')}
                      </td>
                      <td className="px-3 py-2 text-right">{formatAmount(snapshot.demandDays)}</td>
                      <td className="px-3 py-2 text-right">{formatAmount(snapshot.supplyDays)}</td>
                      <td className="px-3 py-2">{snapshot.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );

      case 'column-mapping':
        return (
          <section aria-labelledby="imports-step-column-mapping" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-column-mapping">
              4. Column/type mapping
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              This workbook uses the documented fixed layout (`Status`, `Resource`, `Activity`,
              `Total supply`, `Total demand`, then January–December). Month headers were parsed
              from:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-sm">
              {wizardState.analysis.monthHeaders.map((header) => (
                <li key={header.cellRef}>
                  {header.cellRef}: {header.label} →{' '}
                  {Number.isInteger(header.month)
                    ? `${header.year}-${String(header.month).padStart(2, '0')}`
                    : 'unparseable'}
                </li>
              ))}
            </ul>
          </section>
        );

      case 'row-classification':
        return (
          <section aria-labelledby="imports-step-row-classification" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-row-classification">
              5. Row classification
            </h2>
            <dl className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Group rows</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {wizardState.analysis.statistics.groupRows}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Project rows</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {wizardState.analysis.statistics.projectRows}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Demand rows</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {wizardState.analysis.statistics.demandRows}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Supply rows</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {wizardState.analysis.statistics.supplyRows}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Ambiguous rows</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {wizardState.analysis.statistics.ambiguousRows}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Ignored rows</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {wizardState.analysis.statistics.ignoredRows}
                </dd>
              </div>
            </dl>
            {wizardState.analysis.rawRows.some((row) => row.classification === 'ambiguous') ? (
              <div className="overflow-x-auto rounded-lg border border-[var(--surf-divider)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[var(--surf-700)]">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Confidence</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wizardState.analysis.rawRows
                      .filter((row) => row.classification === 'ambiguous')
                      .map((row) => (
                        <tr className="border-t border-[var(--surf-divider)]" key={row.rowNumber}>
                          <td className="px-3 py-2">{row.rowNumber}</td>
                          <td className="px-3 py-2">{row.classificationConfidence ?? 'n/a'}</td>
                          <td className="px-3 py-2">
                            {row.anomalyNotes.join(' | ') || 'Review required'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-950/20 p-3 text-sm">
                No ambiguous rows detected.
              </p>
            )}
          </section>
        );

      case 'anomaly-review':
        return (
          <section aria-labelledby="imports-step-anomaly-review" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-anomaly-review">
              6. Anomaly review
            </h2>
            {wizardState.analysis.anomalies.length === 0 ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-950/20 p-3 text-sm">
                No anomalies detected.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--surf-divider)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[var(--surf-700)]">
                    <tr>
                      <th className="px-3 py-2">Severity</th>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Cell</th>
                      <th className="px-3 py-2">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wizardState.analysis.anomalies.map((anomaly) => (
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

      case 'comparison':
        return (
          <section aria-labelledby="imports-step-comparison" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-comparison">
              7. Comparison with previous import
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Previous validated import:{' '}
              {wizardState.comparison?.previousBatch
                ? `${wizardState.comparison.previousBatch.fileName} (${formatDateTime(wizardState.comparison.previousBatch.importedAt)})`
                : 'none'}
            </p>
            <dl className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">New keys</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {wizardState.comparison?.newCount ?? 0}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Removed keys</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {wizardState.comparison?.removedCount ?? 0}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Positive delta</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {formatAmount(wizardState.comparison?.positiveDelta ?? 0)}
                </dd>
              </div>
            </dl>
            <div className="overflow-x-auto rounded-lg border border-[var(--surf-divider)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--surf-700)]">
                  <tr>
                    <th className="px-3 py-2">Project</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2 text-right">Delta</th>
                    <th className="px-3 py-2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {(wizardState.comparison?.items ?? []).slice(0, 12).map((item) => (
                    <tr className="border-t border-[var(--surf-divider)]" key={item.key}>
                      <td className="px-3 py-2">{item.projectCode}</td>
                      <td className="px-3 py-2">{item.resourceTypeLabel}</td>
                      <td className="px-3 py-2">
                        {item.year}-{String(item.month).padStart(2, '0')}
                      </td>
                      <td className="px-3 py-2 text-right">{formatAmount(item.deltaDays)}</td>
                      <td className="px-3 py-2">{item.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );

      case 'validation':
        return (
          <section aria-labelledby="imports-step-validation" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-validation">
              8. Validation
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              The commit will be executed in a single IndexedDB transaction only if there are no
              blocking anomalies.
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
              <button
                className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={blockingAnomalies || submitting}
                onClick={() => {
                  void handleCommitImport();
                }}
                type="button"
              >
                {submitting ? 'Importing…' : 'Commit atomic import'}
              </button>
              <button
                className="rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm font-medium"
                onClick={() => setShowCancelDialog(true)}
                type="button"
              >
                Cancel wizard
              </button>
            </div>
          </section>
        );

      case 'atomic-import':
        return (
          <section aria-labelledby="imports-step-atomic-import" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-atomic-import">
              9. Atomic import
            </h2>
            <p className="rounded-md border border-[var(--surf-divider)] p-3 text-sm" role="status">
              {submitting
                ? 'Writing import batch, raw rows, demand snapshots, projects, groups and allocations in one transaction…'
                : 'Waiting for commit result…'}
            </p>
          </section>
        );

      case 'final-report':
        return (
          <section aria-labelledby="imports-step-final-report" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-final-report">
              10. Final report
            </h2>
            <p className="rounded-md border border-emerald-500/40 bg-emerald-950/20 p-3 text-sm">
              Import committed successfully. Download the Markdown report for audit purposes.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm font-medium text-white"
                onClick={handleDownloadReport}
                type="button"
              >
                Download report
              </button>
              <button
                className="rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm font-medium"
                onClick={resetWizard}
                type="button"
              >
                Start another import
              </button>
            </div>
            {wizardState.commitResult ? (
              <dl className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">Batch id</dt>
                  <dd className="mt-1 break-all font-mono text-sm">
                    {wizardState.commitResult.importBatch.id}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">
                    Imported demand snapshots
                  </dt>
                  <dd className="mt-1 font-semibold">
                    {wizardState.commitResult.importedDemandSnapshots}
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
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Imports</h1>
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
          Analyze PSA Excel exports off the main thread, review anomalies, compare against the
          previous validated import, then commit everything atomically.
        </p>
      </header>

      {feedback ? (
        <p className="rounded-md border border-[var(--surf-divider)] p-3 text-sm" role="status">
          {feedback}
        </p>
      ) : null}
      {wizardState.errorMessage ? (
        <p className="rounded-md border border-red-500/50 bg-red-950/20 p-3 text-sm" role="alert">
          {wizardState.errorMessage}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Import wizard</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Ten explicit steps, keyboard navigable, cancelable until commit.
            </p>
          </div>
        </div>

        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {IMPORT_WIZARD_STEPS.map((step, index) => {
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
          <p className="text-sm text-[var(--text-secondary)]">Loading import reference data…</p>
        ) : (
          <>
            {renderStepContent()}

            {wizardState.analysis &&
            !['validation', 'atomic-import', 'final-report'].includes(wizardState.currentStepId) ? (
              <div className="flex flex-wrap gap-3 border-t border-[var(--surf-divider)] pt-4">
                <button
                  className="rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm font-medium"
                  disabled={wizardState.currentStepId === 'technical-analysis'}
                  onClick={() => dispatch({ type: 'go-back' })}
                  type="button"
                >
                  Previous step
                </button>
                <button
                  className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm font-medium text-white"
                  onClick={() => dispatch({ type: 'go-next' })}
                  type="button"
                >
                  Next step
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-6">
        <div>
          <h2 className="text-xl font-semibold">Import history</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Immutable validated batches stored in IndexedDB.
          </p>
        </div>

        {validatedImportHistory.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No validated imports yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--surf-divider)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surf-700)]">
                <tr>
                  <th className="px-3 py-2">Imported at</th>
                  <th className="px-3 py-2">Reference date</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2 text-right">Rows</th>
                  <th className="px-3 py-2">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {validatedImportHistory.map((batch) => (
                  <tr className="border-t border-[var(--surf-divider)]" key={batch.id}>
                    <td className="px-3 py-2">{formatDateTime(batch.importedAt)}</td>
                    <td className="px-3 py-2">{batch.referenceDate}</td>
                    <td className="px-3 py-2">{batch.fileName}</td>
                    <td className="px-3 py-2 text-right">{batch.rowCount}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {batch.fileSha256.slice(0, 16)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel="Reset wizard"
        description="Canceling now discards the in-memory analysis and leaves IndexedDB untouched."
        onCancel={() => setShowCancelDialog(false)}
        onConfirm={resetWizard}
        open={showCancelDialog}
        title="Cancel import wizard?"
      />
    </div>
  );
}
