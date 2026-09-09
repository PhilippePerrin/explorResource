import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FeedbackMessage } from '@/components/FeedbackMessage';
import { AlertCircle, CheckCircle2, Download, RotateCcw, UploadCloud } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, EmptyState, IconChip, Skeleton, TableShell } from '@/components/ui';
import type { DemandSnapshot, ImportBatch, Resource, ResourceType } from '@/domain/entities';
import {
  buildDemandComparisonSummary,
  buildDemandRollbackPlan,
  buildImportComparisonSummary,
  commitImportAnalysis,
  createImportWorkerClient,
  createReportBlob,
  generateImportReportMarkdown,
  hasBlockingAnomalies,
  IMPORT_WIZARD_STEPS,
  importWizardReducer,
  initialImportWizardState,
  restoreDemandFromImportBatch,
  selectLatestDemandSnapshots,
  type DemandRollbackPlan,
  type ImportComparisonProjectSummary,
  type ImportComparisonSummary,
  type ImportWorkerClient,
} from '@/import';
import { createRepository } from '@/persistence/repository';

const resourceTypesRepository = createRepository('resourceTypes');
const resourcesRepository = createRepository('resources');
const importBatchesRepository = createRepository('importBatches');
const demandSnapshotsRepository = createRepository('demandSnapshots');

type ComparisonSourceId = 'current' | ImportBatch['id'];
type RollbackScope = DemandRollbackPlan['scope'];

interface ImportsPageProps {
  workerClientFactory?: () => ImportWorkerClient;
}

interface ImportsPageData {
  resourceTypes: ResourceType[];
  resources: Resource[];
  importBatches: ImportBatch[];
  demandSnapshots: DemandSnapshot[];
}

interface PendingRollback {
  scope: RollbackScope;
  targetBatch: ImportBatch;
  plan: DemandRollbackPlan;
  title: string;
  successMessage: string;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value);
}

function formatDeltaAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value !== 0 && value % 1 !== 0 ? 1 : 0,
    signDisplay: 'exceptZero',
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatMonthLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function resolveLatestValidatedBatch(importBatches: ImportBatch[]): ImportBatch | null {
  return (
    [...importBatches]
      .filter((batch) => batch.status === 'validated')
      .sort((left, right) => right.importedAt.localeCompare(left.importedAt))[0] ?? null
  );
}

function describeCurrentSource(hasManualAdjustments: boolean): string {
  return hasManualAdjustments
    ? 'Current effective demand (includes manual rollback state)'
    : 'Current effective demand';
}

function getSourceLabel(options: {
  sourceId: ComparisonSourceId;
  validatedImportHistory: ImportBatch[];
  hasManualAdjustments: boolean;
}): string {
  if (options.sourceId === 'current') {
    return describeCurrentSource(options.hasManualAdjustments);
  }

  const batch = options.validatedImportHistory.find((item) => item.id === options.sourceId);
  return batch ? `${batch.fileName} (${formatDateTime(batch.importedAt)})` : 'Unknown import batch';
}

function getProjectIndicatorSummary(projectSummary: ImportComparisonProjectSummary): string[] {
  const indicators: string[] = [];

  if (projectSummary.projectState === 'new-project') {
    indicators.push('✨ New project');
  }

  if (projectSummary.projectState === 'removed-project') {
    indicators.push('🗑 Removed project');
  }

  if (projectSummary.addedResourceTypeLabels.length > 0) {
    indicators.push(`➕ Type added: ${projectSummary.addedResourceTypeLabels.join(', ')}`);
  }

  if (projectSummary.removedResourceTypeLabels.length > 0) {
    indicators.push(`➖ Type removed: ${projectSummary.removedResourceTypeLabels.join(', ')}`);
  }

  if (indicators.length === 0) {
    indicators.push('≈ No structural change');
  }

  return indicators;
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--surf-divider)] px-2 py-1 text-xs font-medium">
      {label}
    </span>
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
    demandSnapshots: [],
  });
  const [wizardState, dispatch] = useReducer(importWizardReducer, initialImportWizardState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [comparisonSourceId, setComparisonSourceId] = useState<ComparisonSourceId>('current');
  const [referenceBatchId, setReferenceBatchId] = useState<ImportBatch['id'] | ''>('');
  const [busyRollback, setBusyRollback] = useState(false);
  const [pendingRollback, setPendingRollback] = useState<PendingRollback | null>(null);
  const loadRequestIdRef = useRef(0);
  const workerClient = useMemo(() => workerClientFactory(), [workerClientFactory]);
  const blockingAnomalies = hasBlockingAnomalies(wizardState);
  const importHistory = useMemo(
    () =>
      [...data.importBatches]
        .filter((batch) => batch.kind === 'demand')
        .sort((left, right) => right.importedAt.localeCompare(left.importedAt)),
    [data.importBatches],
  );
  const validatedImportHistory = useMemo(
    () => importHistory.filter((batch) => batch.status === 'validated'),
    [importHistory],
  );
  const demandSnapshotsByImportBatchId = useMemo(() => {
    const snapshotsByBatchId = new Map<string, DemandSnapshot[]>();

    for (const snapshot of data.demandSnapshots) {
      const currentSnapshots = snapshotsByBatchId.get(snapshot.importBatchId) ?? [];
      currentSnapshots.push(snapshot);
      snapshotsByBatchId.set(snapshot.importBatchId, currentSnapshots);
    }

    return snapshotsByBatchId;
  }, [data.demandSnapshots]);
  const resourceTypeLabelsById = useMemo(
    () =>
      new Map(
        data.resourceTypes.map((resourceType) => [resourceType.id, resourceType.label] as const),
      ),
    [data.resourceTypes],
  );
  const currentEffectiveSnapshots = useMemo(
    () => selectLatestDemandSnapshots(data.demandSnapshots),
    [data.demandSnapshots],
  );
  const currentHasManualAdjustments = useMemo(
    () => currentEffectiveSnapshots.some((snapshot) => snapshot.importBatchId === 'manual'),
    [currentEffectiveSnapshots],
  );
  const referenceBatch = useMemo(
    () => validatedImportHistory.find((batch) => batch.id === referenceBatchId) ?? null,
    [referenceBatchId, validatedImportHistory],
  );
  const comparisonSelectionError =
    comparisonSourceId !== 'current' && comparisonSourceId === referenceBatchId
      ? 'Select two different sources to compare imports manually.'
      : '';
  const comparisonSummary = useMemo<ImportComparisonSummary | null>(() => {
    if (comparisonSelectionError) {
      return null;
    }

    const comparedSnapshots =
      comparisonSourceId === 'current'
        ? currentEffectiveSnapshots
        : (demandSnapshotsByImportBatchId.get(comparisonSourceId) ?? []);
    const previousDemandSnapshots = referenceBatch
      ? (demandSnapshotsByImportBatchId.get(referenceBatch.id) ?? [])
      : [];

    return buildDemandComparisonSummary({
      comparedSnapshots,
      previousBatch: referenceBatch
        ? {
            id: referenceBatch.id,
            fileName: referenceBatch.fileName,
            importedAt: referenceBatch.importedAt,
            referenceDate: referenceBatch.referenceDate,
          }
        : null,
      previousDemandSnapshots,
      resourceTypeLabelsById,
    });
  }, [
    comparisonSelectionError,
    comparisonSourceId,
    currentEffectiveSnapshots,
    demandSnapshotsByImportBatchId,
    referenceBatch,
    resourceTypeLabelsById,
  ]);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    return () => {
      workerClient.dispose();
    };
  }, [workerClient]);

  useEffect(() => {
    const defaultReferenceBatchId = validatedImportHistory[1]?.id ?? '';
    const validBatchIds = new Set(validatedImportHistory.map((batch) => batch.id));
    const nextComparisonSourceId =
      comparisonSourceId === 'current' || validBatchIds.has(comparisonSourceId)
        ? comparisonSourceId
        : 'current';
    const nextReferenceBatchId = validBatchIds.has(referenceBatchId)
      ? referenceBatchId
      : defaultReferenceBatchId;

    if (nextComparisonSourceId !== comparisonSourceId) {
      setComparisonSourceId(nextComparisonSourceId);
    }

    if (nextReferenceBatchId !== referenceBatchId) {
      setReferenceBatchId(nextReferenceBatchId);
    }
  }, [comparisonSourceId, referenceBatchId, validatedImportHistory]);

  async function loadData() {
    setLoading(true);
    const requestId = ++loadRequestIdRef.current;

    try {
      const [resourceTypes, resources, importBatches, demandSnapshots] = await Promise.all([
        resourceTypesRepository.getAll(),
        resourcesRepository.getAll(),
        importBatchesRepository.getAll(),
        demandSnapshotsRepository.getAll(),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({ resourceTypes, resources, importBatches, demandSnapshots });
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  function chooseAlternativeReferenceBatch(excludedBatchId: string): ImportBatch['id'] | '' {
    return validatedImportHistory.find((batch) => batch.id !== excludedBatchId)?.id ?? '';
  }

  function handleSelectComparedSource(sourceId: ComparisonSourceId) {
    setComparisonSourceId(sourceId);

    if (sourceId !== 'current' && sourceId === referenceBatchId) {
      setReferenceBatchId(chooseAlternativeReferenceBatch(sourceId));
    }
  }

  function handleSelectReferenceBatch(batchId: ImportBatch['id']) {
    setReferenceBatchId(batchId);

    if (comparisonSourceId !== 'current' && comparisonSourceId === batchId) {
      setComparisonSourceId('current');
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

      const previousBatch = resolveLatestValidatedBatch(data.importBatches);
      const previousDemandSnapshots = previousBatch
        ? (demandSnapshotsByImportBatchId.get(previousBatch.id) ?? [])
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
        resourceTypeLabelsById,
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

  function openRollbackDialog(
    scope: RollbackScope,
    targetBatch: ImportBatch,
    successMessage: string,
  ) {
    const plan = buildDemandRollbackPlan({
      currentSnapshots: currentEffectiveSnapshots,
      targetSnapshots: demandSnapshotsByImportBatchId.get(targetBatch.id) ?? [],
      targetImportBatchId: targetBatch.id,
      scope,
    });

    setPendingRollback({
      scope,
      targetBatch,
      plan,
      title: scope.kind === 'all' ? 'Restore all current demand?' : `Restore ${scope.projectCode}?`,
      successMessage,
    });
  }

  async function handleConfirmRollback() {
    if (!pendingRollback) {
      return;
    }

    setBusyRollback(true);
    setFeedback('');

    try {
      const result = await restoreDemandFromImportBatch({
        targetImportBatchId: pendingRollback.targetBatch.id,
        scope: pendingRollback.scope,
      });

      await loadData();
      setComparisonSourceId('current');
      setReferenceBatchId(pendingRollback.targetBatch.id);
      setFeedback(
        result.restoredSnapshotCount === 0
          ? `Current demand already matches ${pendingRollback.targetBatch.fileName} for the selected scope.`
          : `${pendingRollback.successMessage} ${result.restoredSnapshotCount} manual snapshot(s) created; history was preserved.`,
      );
      setPendingRollback(null);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Unable to restore demand from the selected import.',
      );
    } finally {
      setBusyRollback(false);
    }
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
              <p className="flex items-center gap-3 rounded-md border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm">
                <IconChip icon={AlertCircle} size="sm" tone="critical" />
                Blocking duplicate detected: same SHA-256 as{' '}
                {wizardState.analysis.duplicateOf.fileName}
                {' imported on '}
                {formatDateTime(wizardState.analysis.duplicateOf.importedAt)}.
              </p>
            ) : (
              <p className="flex items-center gap-3 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm">
                <IconChip icon={CheckCircle2} size="sm" tone="success" />
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
            <TableShell caption="Demand snapshot preview (first 10 rows)" zebra>
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
                    <td className="px-3 py-2">{formatMonthLabel(snapshot.year, snapshot.month)}</td>
                    <td className="px-3 py-2 text-right">{formatAmount(snapshot.demandDays)}</td>
                    <td className="px-3 py-2 text-right">{formatAmount(snapshot.supplyDays)}</td>
                    <td className="px-3 py-2">{snapshot.source}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
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
                    ? formatMonthLabel(header.year, header.month)
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
              <TableShell caption="Ambiguous rows" zebra>
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
              </TableShell>
            ) : (
              <p className="flex items-center gap-3 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm">
                <IconChip icon={CheckCircle2} size="sm" tone="success" />
                No ambiguous rows detected.
              </p>
            )}
          </section>
        );

      case 'anomaly-review': {
        const hasUnknownResourceAnomalies = wizardState.analysis.anomalies.some(
          (anomaly) =>
            anomaly.code === 'unknown-resource' || anomaly.code === 'unknown-resource-type',
        );

        return (
          <section aria-labelledby="imports-step-anomaly-review" className="space-y-4">
            <h2 className="text-lg font-semibold" id="imports-step-anomaly-review">
              6. Anomaly review
            </h2>
            {hasUnknownResourceAnomalies || data.resources.length === 0 ? (
              <p className="flex items-start gap-3 rounded-md border border-[var(--status-caution-border)] bg-[var(--status-caution-bg)] p-3 text-sm">
                <IconChip icon={AlertCircle} size="sm" tone="caution" />
                <span>
                  No resources found for the names/types in this file — use{' '}
                  <a className="font-medium underline" href="#/resources/import">
                    Import resources
                  </a>{' '}
                  to create them in bulk from the matching Excel export, then re-run this import.
                </span>
              </p>
            ) : null}
            {wizardState.analysis.anomalies.length === 0 ? (
              <p className="flex items-center gap-3 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm">
                <IconChip icon={CheckCircle2} size="sm" tone="success" />
                No anomalies detected.
              </p>
            ) : (
              <TableShell caption="Import anomalies" zebra>
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
              </TableShell>
            )}
          </section>
        );
      }

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
            <dl className="grid gap-3 md:grid-cols-5">
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
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Negative delta</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {formatAmount(wizardState.comparison?.negativeDelta ?? 0)}
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <dt className="text-sm text-[var(--text-secondary)]">Net delta</dt>
                <dd className="mt-1 text-xl font-semibold">
                  {formatAmount(wizardState.comparison?.netDelta ?? 0)}
                </dd>
              </div>
            </dl>
            <TableShell caption="Comparison with previous import (first 12 rows)" zebra>
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
                    <td className="px-3 py-2">{formatMonthLabel(item.year, item.month)}</td>
                    <td className="px-3 py-2 text-right">{formatAmount(item.deltaDays)}</td>
                    <td className="px-3 py-2">{item.state}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
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
              className={`flex items-center gap-3 rounded-md border p-3 text-sm ${
                blockingAnomalies
                  ? 'border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]'
                  : 'border-[var(--status-success-border)] bg-[var(--status-success-bg)]'
              }`}
              role="status"
            >
              <IconChip
                icon={blockingAnomalies ? AlertCircle : CheckCircle2}
                size="sm"
                tone={blockingAnomalies ? 'critical' : 'success'}
              />
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
                {submitting ? 'Importing…' : 'Commit atomic import'}
              </Button>
              <Button variant="secondary" onClick={() => setShowCancelDialog(true)}>
                Cancel wizard
              </Button>
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
            <p className="flex items-center gap-3 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm">
              <IconChip icon={CheckCircle2} size="sm" tone="success" />
              Import committed successfully. Download the Markdown report for audit purposes.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleDownloadReport}>
                <Download aria-hidden="true" size={16} strokeWidth={2.25} />
                Download report
              </Button>
              <Button variant="secondary" onClick={resetWizard}>
                Start another import
              </Button>
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
      <PageHeader
        description="Analyze PSA Excel exports off the main thread, review anomalies, compare against the previous validated import, keep immutable history, and restore current demand without deleting any import records."
        icon={UploadCloud}
        title="Imports"
      />

      <FeedbackMessage message={feedback} />
      {wizardState.errorMessage ? (
        <p
          className="flex items-center gap-3 rounded-md border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm"
          role="alert"
        >
          <IconChip icon={AlertCircle} size="sm" tone="critical" />
          {wizardState.errorMessage}
        </p>
      ) : null}

      <Card className="space-y-4">
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
          <Skeleton label="Loading import reference data…" lines={4} />
        ) : (
          <>
            {renderStepContent()}

            {wizardState.analysis &&
            !['validation', 'atomic-import', 'final-report'].includes(wizardState.currentStepId) ? (
              <div className="flex flex-wrap gap-3 border-t border-[var(--surf-divider)] pt-4">
                <Button
                  disabled={wizardState.currentStepId === 'technical-analysis'}
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Import history</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              All import batches stay immutable. Restoring demand creates new manual snapshots and
              never deletes history.
            </p>
          </div>
          <StatusPill label={`${validatedImportHistory.length} validated batch(es)`} />
        </div>

        {importHistory.length === 0 ? (
          <EmptyState icon={UploadCloud} title="No imports yet." />
        ) : (
          <TableShell caption="Import history" zebra>
            <thead className="bg-[var(--surf-700)]">
              <tr>
                <th className="px-3 py-2">Imported at</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reference date</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2 text-right">Rows</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {importHistory.map((batch) => (
                <tr className="border-t border-[var(--surf-divider)]" key={batch.id}>
                  <td className="px-3 py-2">{formatDateTime(batch.importedAt)}</td>
                  <td className="px-3 py-2">
                    <StatusPill label={batch.status} />
                  </td>
                  <td className="px-3 py-2">{batch.referenceDate}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{batch.fileName}</div>
                    <div className="font-mono text-xs text-[var(--text-secondary)]">{batch.id}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{batch.rowCount}</td>
                  <td className="px-3 py-2">{batch.note ?? '—'}</td>
                  <td className="px-3 py-2">
                    {batch.status === 'validated' ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSelectComparedSource(batch.id)}
                        >
                          Compare as source
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSelectReferenceBatch(batch.id)}
                        >
                          Compare as reference
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() =>
                            openRollbackDialog(
                              { kind: 'all' },
                              batch,
                              `Restored the current department demand from ${batch.fileName}.`,
                            )
                          }
                        >
                          <RotateCcw aria-hidden="true" size={14} strokeWidth={2.25} />
                          Restore all demand
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-secondary)]">
                        Only validated batches can be compared or restored.
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </section>

      <Card className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Demand comparison</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Default view = current effective demand vs. the immediately preceding validated import.
            Positive, negative, and net deltas stay separate at both department and project level.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 text-sm font-medium">
            Compared demand set
            <select
              className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              onChange={(event) =>
                handleSelectComparedSource(event.target.value as ComparisonSourceId)
              }
              value={comparisonSourceId}
            >
              <option value="current">{describeCurrentSource(currentHasManualAdjustments)}</option>
              {validatedImportHistory.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.fileName} ({formatDateTime(batch.importedAt)})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium">
            Reference import
            <select
              className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              onChange={(event) => handleSelectReferenceBatch(event.target.value)}
              value={referenceBatchId}
            >
              {validatedImportHistory.length === 0 ? (
                <option value="">No validated import yet</option>
              ) : null}
              {validatedImportHistory.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.fileName} ({formatDateTime(batch.importedAt)})
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-lg border border-[var(--surf-divider)] p-4 text-sm">
            <p className="text-[var(--text-secondary)]">Compared label</p>
            <p className="mt-1 font-medium">
              {getSourceLabel({
                sourceId: comparisonSourceId,
                validatedImportHistory,
                hasManualAdjustments: currentHasManualAdjustments,
              })}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--surf-divider)] p-4 text-sm">
            <p className="text-[var(--text-secondary)]">Reference label</p>
            <p className="mt-1 font-medium">
              {referenceBatch
                ? `${referenceBatch.fileName} (${formatDateTime(referenceBatch.importedAt)})`
                : 'No previous validated import available'}
            </p>
          </div>
        </div>

        {currentHasManualAdjustments ? (
          <p className="flex items-center gap-3 rounded-md border border-[var(--status-info-border)] bg-[var(--status-info-bg)] p-3 text-sm">
            <IconChip icon={AlertCircle} size="sm" tone="info" />
            Current demand is derived from the latest snapshot per key. Manual rollback snapshots
            therefore override validated imports without mutating or deleting history.
          </p>
        ) : null}

        {comparisonSelectionError ? (
          <p
            className="flex items-center gap-3 rounded-md border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm"
            role="alert"
          >
            <IconChip icon={AlertCircle} size="sm" tone="critical" />
            {comparisonSelectionError}
          </p>
        ) : null}

        {comparisonSummary ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Department positive</p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatDeltaAmount(comparisonSummary.departmentSummary.positiveDelta)}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Department negative</p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatDeltaAmount(comparisonSummary.departmentSummary.negativeDelta)}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Department net</p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatDeltaAmount(comparisonSummary.departmentSummary.netDelta)}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Changed keys</p>
                <p className="mt-1 text-2xl font-semibold">
                  {comparisonSummary.departmentSummary.changedItemCount}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Project summaries</p>
                <p className="mt-1 text-2xl font-semibold">
                  {comparisonSummary.projectSummaries.length}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--surf-divider)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Department aggregation</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Never silently netted: positive, negative, and net totals are displayed
                    together.
                  </p>
                </div>
                {referenceBatch ? (
                  <Button
                    onClick={() =>
                      openRollbackDialog(
                        { kind: 'all' },
                        referenceBatch,
                        `Restored the current department demand from ${referenceBatch.fileName}.`,
                      )
                    }
                  >
                    <RotateCcw aria-hidden="true" size={16} strokeWidth={2.25} />
                    Restore current demand from reference import
                  </Button>
                ) : null}
              </div>
              <dl className="mt-4 grid gap-3 md:grid-cols-4">
                <div>
                  <dt className="text-sm text-[var(--text-secondary)]">Positive total</dt>
                  <dd className="mt-1 font-semibold">
                    {formatDeltaAmount(comparisonSummary.departmentSummary.positiveDelta)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-[var(--text-secondary)]">Negative total</dt>
                  <dd className="mt-1 font-semibold">
                    {formatDeltaAmount(comparisonSummary.departmentSummary.negativeDelta)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-[var(--text-secondary)]">Net</dt>
                  <dd className="mt-1 font-semibold">
                    {formatDeltaAmount(comparisonSummary.departmentSummary.netDelta)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-[var(--text-secondary)]">Project changes</dt>
                  <dd className="mt-1 font-semibold">
                    {
                      comparisonSummary.projectSummaries.filter(
                        (projectSummary) => projectSummary.changedItemCount > 0,
                      ).length
                    }
                  </dd>
                </div>
              </dl>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Project aggregation</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Indicators include new/removed projects plus resource types added or removed.
                  </p>
                </div>
                <StatusPill label={`${comparisonSummary.projectSummaries.length} project row(s)`} />
              </div>

              {comparisonSummary.projectSummaries.length === 0 ? (
                <EmptyState icon={AlertCircle} title="No demand snapshots to compare yet." />
              ) : (
                <TableShell caption="Project aggregation" zebra>
                  <thead className="bg-[var(--surf-700)]">
                    <tr>
                      <th className="px-3 py-2">Project</th>
                      <th className="px-3 py-2">Indicators</th>
                      <th className="px-3 py-2 text-right">Positive</th>
                      <th className="px-3 py-2 text-right">Negative</th>
                      <th className="px-3 py-2 text-right">Net</th>
                      <th className="px-3 py-2 text-right">Changed keys</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonSummary.projectSummaries.map((projectSummary) => (
                      <tr
                        className="border-t border-[var(--surf-divider)] align-top"
                        key={projectSummary.projectCode}
                      >
                        <td className="px-3 py-2 font-medium">{projectSummary.projectCode}</td>
                        <td className="px-3 py-2">
                          <ul className="space-y-1">
                            {getProjectIndicatorSummary(projectSummary).map((indicator) => (
                              <li key={`${projectSummary.projectCode}-${indicator}`}>
                                {indicator}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatDeltaAmount(projectSummary.positiveDelta)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatDeltaAmount(projectSummary.negativeDelta)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatDeltaAmount(projectSummary.netDelta)}
                        </td>
                        <td className="px-3 py-2 text-right">{projectSummary.changedItemCount}</td>
                        <td className="px-3 py-2">
                          {referenceBatch ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                openRollbackDialog(
                                  { kind: 'project', projectCode: projectSummary.projectCode },
                                  referenceBatch,
                                  `Restored project ${projectSummary.projectCode} from ${referenceBatch.fileName}.`,
                                )
                              }
                            >
                              <RotateCcw aria-hidden="true" size={14} strokeWidth={2.25} />
                              Restore project from reference import
                            </Button>
                          ) : (
                            <span className="text-xs text-[var(--text-secondary)]">
                              Reference import required
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Per-key details</h3>
              <TableShell caption="Per-key demand comparison details" zebra>
                <thead className="bg-[var(--surf-700)]">
                  <tr>
                    <th className="px-3 py-2">Project</th>
                    <th className="px-3 py-2">Resource type</th>
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2 text-right">Reference</th>
                    <th className="px-3 py-2 text-right">Compared</th>
                    <th className="px-3 py-2 text-right">Delta</th>
                    <th className="px-3 py-2">Indicators</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonSummary.items.slice(0, 50).map((item) => (
                    <tr className="border-t border-[var(--surf-divider)]" key={item.key}>
                      <td className="px-3 py-2">{item.projectCode}</td>
                      <td className="px-3 py-2">{item.resourceTypeLabel}</td>
                      <td className="px-3 py-2">{formatMonthLabel(item.year, item.month)}</td>
                      <td className="px-3 py-2 text-right">
                        {formatAmount(item.previousDemandDays)}
                      </td>
                      <td className="px-3 py-2 text-right">{formatAmount(item.nextDemandDays)}</td>
                      <td className="px-3 py-2 text-right">{formatDeltaAmount(item.deltaDays)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <StatusPill label={item.state} />
                          {item.projectState !== 'existing-project' ? (
                            <StatusPill label={item.projectState} />
                          ) : null}
                          {item.resourceTypeState !== 'unchanged-resource-type' ? (
                            <StatusPill label={item.resourceTypeState} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          </>
        ) : (
          <EmptyState icon={AlertCircle} title="No comparison available yet." />
        )}
      </Card>

      <ConfirmDialog
        busy={busyRollback}
        cancelLabel="Keep current demand"
        confirmLabel="Restore demand"
        description={
          pendingRollback ? (
            <div className="space-y-3">
              <p>
                This restores{' '}
                {pendingRollback.scope.kind === 'all'
                  ? 'all current demand'
                  : pendingRollback.scope.projectCode}
                {' from '}
                <strong>{pendingRollback.targetBatch.fileName}</strong> (
                {pendingRollback.targetBatch.referenceDate}).
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  {pendingRollback.plan.changedCount} key(s) will receive a new manual snapshot.
                </li>
                <li>
                  {pendingRollback.plan.zeroedCount} key(s) are absent from the selected import and
                  will be set to 0.
                </li>
                <li>
                  Historical ImportBatch and DemandSnapshot records are kept; nothing is deleted.
                </li>
              </ul>
            </div>
          ) : (
            'Historical data remains untouched.'
          )
        }
        onCancel={() => setPendingRollback(null)}
        onConfirm={handleConfirmRollback}
        open={pendingRollback !== null}
        title={pendingRollback?.title ?? 'Restore demand?'}
      />

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
