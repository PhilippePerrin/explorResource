import { useEffect, useMemo, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import type { Allocation, DemandSnapshot, Resource, ResourceType } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';
import { ConfirmDialog } from '@/components/ConfirmDialog';

import {
  countResourceTypeReferences,
  createResourceTypeDefaultValues,
  createResourceTypeFormSchema,
  getNextDisplayOrder,
  sortResourceTypes,
  type ResourceTypeFormValues,
} from './resourceTypeUtils';

const resourceTypesRepository = createRepository('resourceTypes');
const resourcesRepository = createRepository('resources');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const allocationsRepository = createRepository('allocations');

interface ResourceTypesPageData {
  resourceTypes: ResourceType[];
  resources: Resource[];
  demandSnapshots: DemandSnapshot[];
  allocations: Allocation[];
}

type PendingAction =
  | { type: 'archive'; resourceType: ResourceType }
  | { type: 'restore'; resourceType: ResourceType }
  | { type: 'delete'; resourceType: ResourceType };

function nowIso(): string {
  return new Date().toISOString();
}

function parseIntegerInput(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return Number.NaN;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return Number.NaN;
  }

  return Number(trimmed.replace(',', '.'));
}

function createZodResolver(
  schema: ReturnType<typeof createResourceTypeFormSchema>,
): Resolver<ResourceTypeFormValues> {
  return async (values) => {
    const result = schema.safeParse(values);

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

function getErrorSummary(errors: FieldErrors<ResourceTypeFormValues>): string[] {
  return Object.values(errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));
}

export function ResourceTypesPage() {
  const [data, setData] = useState<ResourceTypesPageData>({
    resourceTypes: [],
    resources: [],
    demandSnapshots: [],
    allocations: [],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [editingResourceTypeId, setEditingResourceTypeId] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [feedback, setFeedback] = useState('');

  const editingResourceType = useMemo(
    () => data.resourceTypes.find((resourceType) => resourceType.id === editingResourceTypeId),
    [data.resourceTypes, editingResourceTypeId],
  );

  const sortedResourceTypes = useMemo(
    () => sortResourceTypes(data.resourceTypes),
    [data.resourceTypes],
  );
  const nextDisplayOrder = useMemo(
    () => getNextDisplayOrder(data.resourceTypes),
    [data.resourceTypes],
  );
  const validationSchema = useMemo(
    () => createResourceTypeFormSchema(data.resourceTypes, editingResourceTypeId),
    [data.resourceTypes, editingResourceTypeId],
  );

  const form = useForm<ResourceTypeFormValues>({
    defaultValues: createResourceTypeDefaultValues(undefined, nextDisplayOrder),
    resolver: createZodResolver(validationSchema),
  });

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    form.reset(createResourceTypeDefaultValues(editingResourceType, nextDisplayOrder));
  }, [editingResourceType, form, nextDisplayOrder]);

  async function loadData() {
    setLoading(true);

    try {
      const [resourceTypes, resources, demandSnapshots, allocations] = await Promise.all([
        resourceTypesRepository.getAll(),
        resourcesRepository.getAll(),
        demandSnapshotsRepository.getAll(),
        allocationsRepository.getAll(),
      ]);

      setData({ resourceTypes, resources, demandSnapshots, allocations });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(values: ResourceTypeFormValues) {
    setSubmitting(true);
    setFeedback('');

    try {
      const timestamp = nowIso();
      const payload: ResourceType = editingResourceType
        ? {
            ...editingResourceType,
            label: values.label.trim(),
            shortCode: values.shortCode.trim() || undefined,
            color: values.color.trim(),
            displayOrder: values.displayOrder,
            updatedAt: timestamp,
          }
        : {
            id: crypto.randomUUID(),
            label: values.label.trim(),
            shortCode: values.shortCode.trim() || undefined,
            color: values.color.trim(),
            displayOrder: values.displayOrder,
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      await resourceTypesRepository.put(payload);
      await loadData();
      setEditingResourceTypeId(undefined);
      form.reset(
        createResourceTypeDefaultValues(undefined, getNextDisplayOrder(data.resourceTypes)),
      );
      setFeedback(editingResourceType ? 'Resource type updated.' : 'Resource type created.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save resource type.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }

    setBusyAction(true);
    setFeedback('');

    try {
      if (pendingAction.type === 'delete') {
        await resourceTypesRepository.delete(pendingAction.resourceType.id);

        if (editingResourceTypeId === pendingAction.resourceType.id) {
          setEditingResourceTypeId(undefined);
          form.reset(createResourceTypeDefaultValues(undefined, nextDisplayOrder));
        }

        setFeedback('Resource type deleted permanently.');
      } else {
        await resourceTypesRepository.put({
          ...pendingAction.resourceType,
          status: pendingAction.type === 'archive' ? 'archived' : 'active',
          updatedAt: nowIso(),
        });
        setFeedback(
          pendingAction.type === 'archive' ? 'Resource type archived.' : 'Resource type restored.',
        );
      }

      setPendingAction(null);
      await loadData();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to complete the action.');
    } finally {
      setBusyAction(false);
    }
  }

  const errorSummary = getErrorSummary(form.formState.errors);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6" id="resource-types-page">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Resource Types</h1>
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
          Manage the skill and role referential. Resource types can be permanently deleted only when
          they are unused across resources, demand snapshots, and allocations.
        </p>
      </header>

      <FeedbackMessage message={feedback} />

      <div className="grid gap-6 lg:grid-cols-[minmax(22rem,30rem)_1fr]">
        <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {editingResourceType ? 'Edit resource type' : 'Create resource type'}
            </h2>
            {editingResourceType ? (
              <button
                className="text-sm underline"
                onClick={() => {
                  setEditingResourceTypeId(undefined);
                  form.reset(createResourceTypeDefaultValues(undefined, nextDisplayOrder));
                }}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>

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
              void handleSubmit(values);
            })}
          >
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="resource-type-label">
                Label
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-type-label"
                type="text"
                {...form.register('label')}
              />
              {form.formState.errors.label ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {form.formState.errors.label.message}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="resource-type-short-code">
                Short code
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-type-short-code"
                type="text"
                {...form.register('shortCode')}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="resource-type-color">
                Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  className="h-10 w-14 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)]"
                  id="resource-type-color"
                  type="color"
                  {...form.register('color')}
                />
                <span
                  aria-label="Color hex value"
                  className="rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                >
                  {form.watch('color')}
                </span>
              </div>
              {form.formState.errors.color ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {form.formState.errors.color.message}
                </p>
              ) : null}
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="resource-type-display-order"
              >
                Display order
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-type-display-order"
                inputMode="numeric"
                type="text"
                {...form.register('displayOrder', {
                  setValueAs: parseIntegerInput,
                })}
              />
              {form.formState.errors.displayOrder ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {form.formState.errors.displayOrder.message}
                </p>
              ) : null}
            </div>

            <button
              className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
              disabled={submitting}
              type="submit"
            >
              {submitting
                ? 'Saving…'
                : editingResourceType
                  ? 'Save changes'
                  : 'Create resource type'}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
          <h2 className="mb-4 text-xl font-semibold">Resource type list</h2>

          {loading ? (
            <p>Loading resource types…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <caption className="sr-only">Resource types with usage counts and actions.</caption>
                <thead>
                  <tr className="border-b border-[var(--surf-divider)]">
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Order
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Label
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Short code
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Color
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Status
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      References
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResourceTypes.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-[var(--text-secondary)]" colSpan={7}>
                        No resource types yet.
                      </td>
                    </tr>
                  ) : null}

                  {sortedResourceTypes.map((resourceType) => {
                    const referenceCount = countResourceTypeReferences(
                      {
                        resources: data.resources,
                        demandSnapshots: data.demandSnapshots,
                        allocations: data.allocations,
                      },
                      resourceType.id,
                    );
                    const canDelete = referenceCount === 0;

                    return (
                      <tr
                        className="border-b border-[var(--surf-divider)] align-top"
                        key={resourceType.id}
                      >
                        <td className="px-3 py-3">{resourceType.displayOrder}</td>
                        <td className="px-3 py-3 font-medium">{resourceType.label}</td>
                        <td className="px-3 py-3">{resourceType.shortCode ?? '—'}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="inline-block h-4 w-4 rounded-full border border-black/20"
                              style={{ backgroundColor: resourceType.color }}
                            />
                            <span>{resourceType.color}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                              resourceType.status === 'active'
                                ? 'bg-green-900/40 text-green-300'
                                : 'bg-amber-900/40 text-amber-300'
                            }`}
                          >
                            {resourceType.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">{referenceCount}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-md border border-[var(--surf-divider)] px-3 py-1.5"
                              onClick={() => setEditingResourceTypeId(resourceType.id)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md border border-[var(--surf-divider)] px-3 py-1.5"
                              onClick={() =>
                                setPendingAction({
                                  type: resourceType.status === 'active' ? 'archive' : 'restore',
                                  resourceType,
                                })
                              }
                              type="button"
                            >
                              {resourceType.status === 'active' ? 'Archive' : 'Restore'}
                            </button>
                            {canDelete ? (
                              <button
                                className="rounded-md border border-red-500/50 px-3 py-1.5 text-red-300"
                                onClick={() => setPendingAction({ type: 'delete', resourceType })}
                                type="button"
                              >
                                Delete permanently
                              </button>
                            ) : (
                              <span className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                                Archive only: resource type still has references.
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        busy={busyAction}
        confirmLabel={
          pendingAction?.type === 'delete'
            ? 'Delete permanently'
            : pendingAction?.type === 'archive'
              ? 'Archive'
              : 'Restore'
        }
        description={
          pendingAction ? (
            <p>
              {pendingAction.type === 'delete'
                ? `Delete "${pendingAction.resourceType.label}" permanently? This cannot be undone.`
                : pendingAction.type === 'archive'
                  ? `Archive "${pendingAction.resourceType.label}"? Existing history keeps referencing this resource type.`
                  : `Restore "${pendingAction.resourceType.label}" to the active referential?`}
            </p>
          ) : null
        }
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
        open={pendingAction !== null}
        title={
          pendingAction?.type === 'delete'
            ? 'Confirm permanent deletion'
            : pendingAction?.type === 'archive'
              ? 'Confirm archive'
              : 'Confirm restore'
        }
        tone={pendingAction?.type === 'delete' ? 'danger' : 'default'}
      />
    </div>
  );
}
