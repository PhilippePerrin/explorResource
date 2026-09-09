import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FeedbackMessage } from '@/components/FeedbackMessage';
import type { ImportBatch, Resource, ResourceType } from '@/domain/entities';
import {
  commitResourceImportAnalysis,
  createResourceImportReportBlob,
  createResourceImportWorkerClient,
  generateResourceImportReportMarkdown,
  hasBlockingAnomalies,
  initialResourceImportWizardState,
  resourceImportWizardReducer,
  RESOURCE_IMPORT_WIZARD_STEPS,
  type ResourceImportWorkerClient,
} from '@/resourceImport';
import { createRepository } from '@/persistence/repository';

const resourceTypesRepository = createRepository('resourceTypes');
const resourcesRepository = createRepository('resources');
const importBatchesRepository = createRepository('importBatches');

interface ResourceImportPageProps {
  workerClientFactory?: () => ResourceImportWorkerClient;
}

interface ResourceImportPageData {
  resourceTypes: ResourceType[];
  resources: Resource[];
  importBatches: ImportBatch[];
}

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

export function ResourceImportPage({
  workerClientFactory = createResourceImportWorkerClient,
}: ResourceImportPageProps) {
  const [data, setData] = useState<ResourceImportPageData>({
    resourceTypes: [],
    resources: [],
    importBatches: [],
  });
  const [wizardState, dispatch] = useReducer(
    resourceImportWizardReducer,
    initialResourceImportWizardState,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const loadRequestIdRef = useRef(0);
  const workerClient = useMemo(() => workerClientFactory(), [workerClientFactory]);
  const blockingAnomalies = hasBlockingAnomalies(wizardState);

  const resourceImportHistory = useMemo(
    () =>
      [...data.importBatches]
        .filter((batch) => batch.kind === 'resource')
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
      const commitResult = await commitResourceImportAnalysis({
        analysis: wizardState.analysis,
        note: wizardState.note.trim() || undefined,
      });
      const reportMarkdown = generateResourceImportReportMarkdown({
        analysis: wizardState.analysis,
        commitResult,
      });

      dispatch({ type: 'commit-succeeded', commitResult, reportMarkdown });
      await loadData();
      setFeedback(
        `Resource import committed successfully as batch ${commitResult.importBatch.id}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to commit the resource import.';
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

    const blob = createResourceImportReportBlob(wizardState.reportMarkdown);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${wizardState.analysis?.fileName ?? 'resource-import-report'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function renderStepContent() {
    if (wizardState.currentStepId === 'file-selection') {
      return (
        <section aria-labelledby="resource-import-step-file-selection" className="space-y-4">
          <h2 className="text-lg font-semibold" id="resource-import-step-file-selection">
            1. File selection
          </h2>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="resource-import-file-input">
              Excel workbook (Availability list)
            </label>
            <input
              accept=".xlsx"
              className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="resource-import-file-input"
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
            <label className="block text-sm font-medium" htmlFor="resource-import-note-input">
              Import note
            </label>
            <textarea
              className="min-h-24 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="resource-import-note-input"
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
        const toCreate = analysis.resources.filter((resource) => resource.action === 'create');
        const toUpdate = analysis.resources.filter((resource) => resource.action === 'update');
        const unchanged = analysis.resources.filter((resource) => resource.action === 'unchanged');

        return (
          <section aria-labelledby="resource-import-step-preview" className="space-y-4">
            <h2 className="text-lg font-semibold" id="resource-import-step-preview">
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
                <p className="text-sm text-[var(--text-secondary)]">New resource types</p>
                <p className="mt-1 text-2xl font-semibold">
                  {analysis.resourceTypesToCreate.length}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Resources to create</p>
                <p className="mt-1 text-2xl font-semibold">{toCreate.length}</p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Resources to update</p>
                <p className="mt-1 text-2xl font-semibold">{toUpdate.length}</p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Unchanged</p>
                <p className="mt-1 text-2xl font-semibold">{unchanged.length}</p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Skipped [Inactive Res.]</p>
                <p className="mt-1 text-2xl font-semibold">
                  {analysis.statistics.skippedInactiveCount}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">No longer listed</p>
                <p className="mt-1 text-2xl font-semibold">{analysis.noLongerListed.length}</p>
              </div>
            </div>

            {analysis.resourceTypesToCreate.length > 0 ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-sm">
                <p className="font-medium">New resource types will be created:</p>
                <ul className="mt-1 list-disc pl-5">
                  {analysis.resourceTypesToCreate.map((resourceType) => (
                    <li key={resourceType.label}>{resourceType.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-[var(--surf-divider)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--surf-700)]">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Resource type</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...toCreate, ...toUpdate].map((resource) => (
                    <tr
                      className="border-t border-[var(--surf-divider)]"
                      key={`${resource.resourceTypeLabel}-${resource.firstName}-${resource.lastName}`}
                    >
                      <td className="px-3 py-2">
                        {resource.firstName} {resource.lastName}
                      </td>
                      <td className="px-3 py-2">
                        {resource.action === 'update' && resource.previousResourceTypeLabel ? (
                          <span>
                            {resource.previousResourceTypeLabel} → {resource.resourceTypeLabel}
                          </span>
                        ) : (
                          resource.resourceTypeLabel
                        )}
                      </td>
                      <td className="px-3 py-2 capitalize">{resource.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {analysis.noLongerListed.length > 0 ? (
              <div className="rounded-lg border border-[var(--surf-divider)] p-4 text-sm">
                <p className="font-medium">
                  No longer listed in this file (not archived automatically — review manually on the
                  Resources page):
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {analysis.noLongerListed.map((resource) => (
                    <li key={resource.id}>
                      {resource.firstName} {resource.lastName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      }

      case 'anomaly-review':
        return (
          <section aria-labelledby="resource-import-step-anomaly-review" className="space-y-4">
            <h2 className="text-lg font-semibold" id="resource-import-step-anomaly-review">
              3. Anomaly review
            </h2>
            {analysis.anomalies.length === 0 ? (
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
          <section aria-labelledby="resource-import-step-commit" className="space-y-4">
            <h2 className="text-lg font-semibold" id="resource-import-step-commit">
              4. Commit
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              The commit will create/update resource types and resources in a single IndexedDB
              transaction, only if there are no blocking anomalies.
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
                {submitting ? 'Importing…' : 'Commit resource import'}
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

      case 'final-report':
        return (
          <section aria-labelledby="resource-import-step-final-report" className="space-y-4">
            <h2 className="text-lg font-semibold" id="resource-import-step-final-report">
              5. Final report
            </h2>
            <p className="rounded-md border border-emerald-500/40 bg-emerald-950/20 p-3 text-sm">
              Resource import committed successfully. Download the Markdown report for audit
              purposes, then head to <strong>Imports</strong> to import the demand workbook — the
              resource names now line up.
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
              <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">Batch id</dt>
                  <dd className="mt-1 break-all font-mono text-sm">
                    {wizardState.commitResult.importBatch.id}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">Created resources</dt>
                  <dd className="mt-1 font-semibold">
                    {wizardState.commitResult.createdResources}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">Updated resources</dt>
                  <dd className="mt-1 font-semibold">
                    {wizardState.commitResult.updatedResources}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--surf-divider)] p-4">
                  <dt className="text-sm text-[var(--text-secondary)]">New resource types</dt>
                  <dd className="mt-1 font-semibold">
                    {wizardState.commitResult.createdResourceTypes}
                  </dd>
                </div>
              </dl>
            ) : null}
            {wizardState.commitResult && wizardState.commitResult.skippedTypeChanges.length > 0 ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-sm">
                <p className="font-medium">
                  {wizardState.commitResult.skippedTypeChanges.length} resource(s) already have
                  allocations, so their type could not be changed automatically:
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {wizardState.commitResult.skippedTypeChanges.map((skipped) => (
                    <li key={skipped.resourceId}>
                      {skipped.fullName} → {skipped.attemptedResourceTypeLabel}
                    </li>
                  ))}
                </ul>
              </div>
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
        <h1 className="text-3xl font-semibold">Import resources</h1>
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
          Bulk-create Resources and Resource Types from a PSA "Availability list" export, using the
          same "Firstname LASTNAME" naming convention as the demand workbook so names line up.
          Entries under any resource-type header prefixed "[Inactive Res.]" are always skipped.
        </p>
      </header>

      <FeedbackMessage message={feedback} />
      {wizardState.errorMessage ? (
        <p className="rounded-md border border-red-500/50 bg-red-950/20 p-3 text-sm" role="alert">
          {wizardState.errorMessage}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-6">
        <div>
          <h2 className="text-xl font-semibold">Resource import wizard</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Five explicit steps, keyboard navigable, cancelable until commit.
          </p>
        </div>

        <ol className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {RESOURCE_IMPORT_WIZARD_STEPS.map((step, index) => {
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
          <p className="text-sm text-[var(--text-secondary)]">Loading reference data…</p>
        ) : (
          <>
            {renderStepContent()}

            {wizardState.analysis &&
            !['commit', 'final-report'].includes(wizardState.currentStepId) ? (
              <div className="flex flex-wrap gap-3 border-t border-[var(--surf-divider)] pt-4">
                <button
                  className="rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm font-medium"
                  disabled={wizardState.currentStepId === 'preview'}
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
        <h2 className="text-xl font-semibold">Resource import history</h2>
        {resourceImportHistory.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No resource imports yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--surf-divider)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surf-700)]">
                <tr>
                  <th className="px-3 py-2">Imported at</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2 text-right">Rows</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {resourceImportHistory.map((batch) => (
                  <tr className="border-t border-[var(--surf-divider)]" key={batch.id}>
                    <td className="px-3 py-2">{formatDateTime(batch.importedAt)}</td>
                    <td className="px-3 py-2">{batch.fileName}</td>
                    <td className="px-3 py-2 text-right">{batch.rowCount}</td>
                    <td className="px-3 py-2">{batch.note ?? '—'}</td>
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
        title="Cancel resource import wizard?"
      />
    </div>
  );
}
