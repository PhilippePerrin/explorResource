import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import { Pencil, Plus, Rocket, RotateCcw, Trash2 } from '@/components/icons';
import type { Project, ProjectRelease, Release } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button, Card, EmptyState, IconChip, Skeleton, TableShell } from '@/components/ui';

import {
  buildReleaseTimeline,
  countReleaseReferences,
  createReleaseDefaultValues,
  createReleaseFormSchema,
  formatIsoDateLabel,
  getReleaseProjectIds,
  sortProjectsForSelection,
  sortReleases,
  type ReleaseFormValues,
} from './releaseUtils';

const releasesRepository = createRepository('releases');
const projectsRepository = createRepository('projects');
const projectReleasesRepository = createRepository('projectReleases');

type StatusFilter = 'all' | Release['status'];

interface ReleasesPageData {
  releases: Release[];
  projects: Project[];
  projectReleases: ProjectRelease[];
}

type PendingAction =
  | { type: 'archive' | 'restore'; release: Release; referenceCount: number }
  | { type: 'delete'; release: Release; referenceCount: number };

function nowIso(): string {
  return new Date().toISOString();
}

function createZodResolver(
  schema: ReturnType<typeof createReleaseFormSchema>,
): Resolver<ReleaseFormValues> {
  return async (values) => {
    const result = schema.safeParse(values);

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

function getErrorSummary(errors: FieldErrors<ReleaseFormValues>): string[] {
  return Object.values(errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));
}

async function syncReleaseProjectLinks(
  releaseId: Release['id'],
  projectIds: readonly string[],
  projectReleases: readonly ProjectRelease[],
  timestamp: string,
) {
  const currentLinks = projectReleases.filter(
    (projectRelease) => projectRelease.releaseId === releaseId,
  );
  const currentByProjectId = new Map(
    currentLinks.map((projectRelease) => [projectRelease.projectId, projectRelease]),
  );
  const nextProjectIds = [...new Set(projectIds)];

  await Promise.all(
    currentLinks
      .filter((projectRelease) => !nextProjectIds.includes(projectRelease.projectId))
      .map((projectRelease) => projectReleasesRepository.delete(projectRelease.id)),
  );

  await Promise.all(
    nextProjectIds
      .filter((projectId) => !currentByProjectId.has(projectId))
      .map((projectId) =>
        projectReleasesRepository.put({
          id: crypto.randomUUID(),
          projectId,
          releaseId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
  );
}

export function ReleasesPage() {
  const [data, setData] = useState<ReleasesPageData>({
    releases: [],
    projects: [],
    projectReleases: [],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [editingReleaseId, setEditingReleaseId] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [feedback, setFeedback] = useState('');
  const loadRequestIdRef = useRef(0);

  const editingRelease = useMemo(
    () => data.releases.find((release) => release.id === editingReleaseId),
    [data.releases, editingReleaseId],
  );
  const validationSchema = useMemo(
    () => createReleaseFormSchema(data.releases, editingReleaseId),
    [data.releases, editingReleaseId],
  );
  const sortedReleases = useMemo(() => sortReleases(data.releases), [data.releases]);
  const projectOptions = useMemo(() => sortProjectsForSelection(data.projects), [data.projects]);
  const projectLookup = useMemo(
    () => new Map(data.projects.map((project) => [project.id, project])),
    [data.projects],
  );
  const releaseRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toUpperCase();

    return sortedReleases.filter((release) => {
      const matchesStatus = statusFilter === 'all' || release.status === statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        release.name.toUpperCase().includes(normalizedSearch) ||
        release.goLiveDate.includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [searchTerm, sortedReleases, statusFilter]);
  const timelineGroups = useMemo(
    () => buildReleaseTimeline(sortedReleases, data.projectReleases, data.projects),
    [data.projectReleases, data.projects, sortedReleases],
  );

  const form = useForm<ReleaseFormValues>({
    defaultValues: createReleaseDefaultValues(),
    resolver: createZodResolver(validationSchema),
  });

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const requestId = ++loadRequestIdRef.current;

    try {
      const [releases, projects, projectReleases] = await Promise.all([
        releasesRepository.getAll(),
        projectsRepository.getAll(),
        projectReleasesRepository.getAll(),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({ releases, projects, projectReleases });
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  async function handleSubmit(values: ReleaseFormValues) {
    setSubmitting(true);
    setFeedback('');

    try {
      const timestamp = nowIso();
      const releaseId = editingRelease?.id ?? crypto.randomUUID();
      const payload: Release = editingRelease
        ? {
            ...editingRelease,
            name: values.name.trim(),
            goLiveDate: values.goLiveDate,
            color: values.color.trim(),
            status: values.status,
            updatedAt: timestamp,
          }
        : {
            id: releaseId,
            name: values.name.trim(),
            goLiveDate: values.goLiveDate,
            color: values.color.trim(),
            status: values.status,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      await releasesRepository.put(payload);
      await syncReleaseProjectLinks(releaseId, values.projectIds, data.projectReleases, timestamp);
      await loadData();
      setEditingReleaseId(releaseId);
      form.reset({
        name: payload.name,
        goLiveDate: payload.goLiveDate,
        color: payload.color ?? '#00427f',
        status: payload.status,
        projectIds: [...values.projectIds],
      });
      setFeedback(editingRelease ? 'Release updated.' : 'Release created.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save release.');
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
        await releasesRepository.delete(pendingAction.release.id);

        if (editingReleaseId === pendingAction.release.id) {
          setEditingReleaseId(undefined);
          form.reset(createReleaseDefaultValues());
        }

        setFeedback('Release deleted permanently.');
      } else {
        await releasesRepository.put({
          ...pendingAction.release,
          status: pendingAction.type === 'archive' ? 'archived' : 'active',
          updatedAt: nowIso(),
        });
        setFeedback(pendingAction.type === 'archive' ? 'Release archived.' : 'Release restored.');
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
  const linkedProjectIds = getReleaseProjectIds(data.projectReleases, editingRelease?.id);
  const linkedProjects = linkedProjectIds
    .map((projectId) => projectLookup.get(projectId))
    .filter((project): project is Project => Boolean(project));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6" id="releases-page">
      <header className="relative flex items-start gap-3 overflow-hidden rounded-2xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full opacity-25 blur-3xl"
          style={{
            background:
              'linear-gradient(135deg, var(--color-bmx-blue) 0%, var(--color-bmx-cyan) 100%)',
          }}
        />
        <IconChip className="relative" icon={Rocket} size="lg" tone="accent" />
        <div className="relative space-y-2">
          <h1 className="text-3xl font-semibold">Releases</h1>
          <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
            Manage release go-live dates, display colors, statuses, and linked projects. Releases
            are archived instead of deleted once any project is linked to them.
          </p>
        </div>
      </header>

      <FeedbackMessage message={feedback} />

      <section className="grid gap-6 lg:grid-cols-[minmax(22rem,30rem)_1fr]">
        <section>
          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Release list</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Open a release to edit it or inspect its linked projects.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditingReleaseId(undefined);
                  form.reset(createReleaseDefaultValues());
                }}
              >
                <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
                New release
              </Button>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="release-search">
                  Search releases
                </label>
                <input
                  className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                  id="release-search"
                  placeholder="Search by name or date"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="release-status-filter">
                  Status filter
                </label>
                <select
                  className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                  id="release-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {loading ? (
              <Skeleton label="Loading releases…" lines={4} />
            ) : (
              <TableShell
                caption="Releases with go-live dates, linked projects, and actions."
                zebra
              >
                <thead>
                  <tr className="border-b border-[var(--surf-divider)]">
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Name
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Go-live date
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Status
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Linked projects
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {releaseRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4" colSpan={5}>
                        <EmptyState icon={Rocket} title="No releases match the current filters." />
                      </td>
                    </tr>
                  ) : null}

                  {releaseRows.map((release) => {
                    const referenceCount = countReleaseReferences(data.projectReleases, release.id);
                    const canDelete = referenceCount === 0;

                    return (
                      <tr
                        className="border-b border-[var(--surf-divider)] align-top"
                        key={release.id}
                      >
                        <td className="px-3 py-3">
                          <div className="font-medium">{release.name}</div>
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">
                            Color {release.color ?? 'not set'}
                          </div>
                        </td>
                        <td className="px-3 py-3">{formatIsoDateLabel(release.goLiveDate)}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                              release.status === 'active'
                                ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                                : 'border-[var(--status-caution-border)] bg-[var(--status-caution-bg)] text-[var(--status-caution-text)]'
                            }`}
                          >
                            {release.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">{referenceCount}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingReleaseId(release.id);
                                form.reset(
                                  createReleaseDefaultValues(release, data.projectReleases),
                                );
                              }}
                            >
                              <Pencil aria-hidden="true" size={14} strokeWidth={2.25} />
                              Edit details
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setPendingAction({
                                  type: release.status === 'active' ? 'archive' : 'restore',
                                  release,
                                  referenceCount,
                                })
                              }
                            >
                              <RotateCcw aria-hidden="true" size={14} strokeWidth={2.25} />
                              {release.status === 'active' ? 'Archive' : 'Restore'}
                            </Button>
                            {canDelete ? (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() =>
                                  setPendingAction({
                                    type: 'delete',
                                    release,
                                    referenceCount,
                                  })
                                }
                              >
                                <Trash2 aria-hidden="true" size={14} strokeWidth={2.25} />
                                Delete permanently
                              </Button>
                            ) : (
                              <span className="text-xs text-[var(--text-secondary)]">
                                Archive only: release is linked to projects.
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            )}
          </Card>
        </section>

        <section>
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  {editingRelease ? 'Release details' : 'Create release'}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {editingRelease
                    ? 'Adjust the release metadata and update its linked projects.'
                    : 'Create a release with one go-live date and optional project links.'}
                </p>
              </div>
              {editingRelease ? (
                <Button
                  className="underline"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingReleaseId(undefined);
                    form.reset(createReleaseDefaultValues());
                  }}
                >
                  Clear
                </Button>
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
                <label className="mb-1 block text-sm font-medium" htmlFor="release-name">
                  Release name
                </label>
                <input
                  className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                  id="release-name"
                  type="text"
                  {...form.register('name')}
                />
                {form.formState.errors.name ? (
                  <p className="mt-1 text-sm text-red-400" role="alert">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="release-go-live-date">
                  Go-live date
                </label>
                <input
                  className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                  id="release-go-live-date"
                  type="date"
                  {...form.register('goLiveDate')}
                />
                {form.formState.errors.goLiveDate ? (
                  <p className="mt-1 text-sm text-red-400" role="alert">
                    {form.formState.errors.goLiveDate.message}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="release-color">
                  Release color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    className="h-10 w-14 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)]"
                    id="release-color"
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
                <label className="mb-1 block text-sm font-medium" htmlFor="release-status">
                  Status
                </label>
                <select
                  className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                  id="release-status"
                  {...form.register('status')}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <fieldset className="rounded-lg border border-[var(--surf-divider)] p-4">
                <legend className="px-1 text-sm font-medium">Linked projects</legend>
                {projectOptions.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    No projects available yet. Create projects first, then link them here.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {projectOptions.map((project) => (
                      <label
                        className="flex items-start gap-3 rounded-md border border-[var(--surf-divider)] p-3"
                        key={project.id}
                      >
                        <input
                          className="mt-1"
                          type="checkbox"
                          value={project.id}
                          {...form.register('projectIds')}
                        />
                        <span className="space-y-1 text-sm">
                          <span className="block font-medium">{project.code}</span>
                          <span className="block text-[var(--text-secondary)]">
                            {project.name} · {project.status}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              {editingRelease ? (
                <section className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4">
                  <h3 className="text-sm font-semibold">Linked project summary</h3>
                  {linkedProjects.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">No projects linked.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm">
                      {linkedProjects.map((project) => (
                        <li key={project.id}>
                          <span className="font-medium">{project.code}</span> — {project.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}

              <Button disabled={submitting} type="submit">
                {submitting ? 'Saving…' : editingRelease ? 'Save changes' : 'Create release'}
              </Button>
            </form>
          </Card>
        </section>
      </section>

      <section>
        <Card>
          <h2 className="text-xl font-semibold">Release timeline</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Calendar-style view of release go-live dates. Each entry includes text status and linked
            projects so information is never conveyed by color alone.
          </p>

          {timelineGroups.length === 0 ? (
            <EmptyState className="mt-4" icon={Rocket} title="No releases scheduled yet." />
          ) : (
            <div className="mt-4 space-y-5">
              {timelineGroups.map((group) => (
                <section key={group.monthKey}>
                  <h3 className="text-lg font-semibold">{group.monthLabel}</h3>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {group.entries.map((entry) => (
                      <article
                        className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4"
                        key={entry.releaseId}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-semibold">{entry.releaseName}</h4>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {formatIsoDateLabel(entry.goLiveDate)}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                              entry.status === 'active'
                                ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                                : 'border-[var(--status-caution-border)] bg-[var(--status-caution-bg)] text-[var(--status-caution-text)]'
                            }`}
                          >
                            {entry.status}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <span
                            aria-hidden="true"
                            className="inline-block h-3 w-3 rounded-full border border-white/40"
                            style={{ backgroundColor: entry.color ?? '#00427f' }}
                          />
                          <span>Color {entry.color ?? 'not set'}</span>
                        </div>
                        <div className="mt-3 text-sm">
                          <p className="font-medium">Linked projects</p>
                          {entry.projectNames.length === 0 ? (
                            <p className="mt-1 text-[var(--text-secondary)]">No projects linked.</p>
                          ) : (
                            <ul className="mt-1 list-disc pl-5 text-[var(--text-secondary)]">
                              {entry.projectNames.map((projectName) => (
                                <li key={projectName}>{projectName}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Card>
      </section>

      <ConfirmDialog
        busy={busyAction}
        cancelLabel="Cancel"
        confirmLabel={
          pendingAction?.type === 'delete'
            ? 'Delete permanently'
            : pendingAction?.type === 'archive'
              ? 'Archive'
              : 'Restore'
        }
        description={
          pendingAction ? (
            <>
              <p>
                {pendingAction.type === 'delete'
                  ? `Delete release ${pendingAction.release.name} permanently?`
                  : pendingAction.type === 'archive'
                    ? `Archive release ${pendingAction.release.name}?`
                    : `Restore release ${pendingAction.release.name}?`}
              </p>
              <p className="mt-2">Linked project references: {pendingAction.referenceCount}.</p>
            </>
          ) : (
            ''
          )
        }
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          void confirmPendingAction();
        }}
        open={Boolean(pendingAction)}
        title={
          pendingAction?.type === 'delete'
            ? 'Delete release'
            : pendingAction?.type === 'archive'
              ? 'Archive release'
              : 'Restore release'
        }
        tone={pendingAction?.type === 'delete' ? 'danger' : 'default'}
      />
    </div>
  );
}
