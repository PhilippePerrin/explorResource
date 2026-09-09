import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import { FilterBar, type FilterBarField } from '@/components/FilterBar';
import { FolderKanban, FolderTree, Pencil, Plus, RotateCcw, Trash2 } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import type {
  Allocation,
  DemandSnapshot,
  Group,
  Project,
  ProjectRelease,
  Release,
} from '@/domain/entities';
import { usePersistentPageFilters, type FilterDefinitions } from '@/features/filters/filterState';
import { createRepository } from '@/persistence/repository';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button, Card, Drawer, EmptyState, Skeleton, TableShell } from '@/components/ui';

import {
  buildProjectCodeMigrationPlan,
  countProjectReferences,
  createProjectDefaultValues,
  createProjectFormSchema,
  getProjectReleaseIds,
  sortProjects,
  sortReleasesForSelection,
  type ProjectFormValues,
} from './projectUtils';

const projectsRepository = createRepository('projects');
const releasesRepository = createRepository('releases');
const projectReleasesRepository = createRepository('projectReleases');
const groupsRepository = createRepository('groups');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const allocationsRepository = createRepository('allocations');

type StatusFilter = 'all' | Project['status'];

interface ProjectFilters {
  searchTerm: string;
  statusFilter: StatusFilter;
  releaseIdsFilter: readonly string[];
}

interface ProjectsPageData {
  projects: Project[];
  releases: Release[];
  projectReleases: ProjectRelease[];
  groups: Group[];
  demandSnapshots: DemandSnapshot[];
  allocations: Allocation[];
}

type PendingAction =
  | {
      type: 'archive' | 'restore';
      project: Project;
      referenceCount: number;
      releaseCount: number;
    }
  | {
      type: 'delete';
      project: Project;
      referenceCount: number;
      releaseCount: number;
    };

function nowIso(): string {
  return new Date().toISOString();
}

function createZodResolver(
  schema: ReturnType<typeof createProjectFormSchema>,
): Resolver<ProjectFormValues> {
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

function getErrorSummary(errors: FieldErrors<ProjectFormValues>): string[] {
  return Object.values(errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));
}

async function syncProjectReleaseLinks(
  projectId: Project['id'],
  releaseIds: readonly string[],
  projectReleases: readonly ProjectRelease[],
  timestamp: string,
) {
  const currentLinks = projectReleases.filter(
    (projectRelease) => projectRelease.projectId === projectId,
  );
  const currentByReleaseId = new Map(
    currentLinks.map((projectRelease) => [projectRelease.releaseId, projectRelease]),
  );
  const nextReleaseIds = [...new Set(releaseIds)];

  await Promise.all(
    currentLinks
      .filter((projectRelease) => !nextReleaseIds.includes(projectRelease.releaseId))
      .map((projectRelease) => projectReleasesRepository.delete(projectRelease.id)),
  );

  await Promise.all(
    nextReleaseIds
      .filter((releaseId) => !currentByReleaseId.has(releaseId))
      .map((releaseId) =>
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

export function ProjectsPage() {
  const [data, setData] = useState<ProjectsPageData>({
    projects: [],
    releases: [],
    projectReleases: [],
    groups: [],
    demandSnapshots: [],
    allocations: [],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [feedback, setFeedback] = useState('');
  const loadRequestIdRef = useRef(0);
  const filterDefinitions = useMemo<FilterDefinitions<ProjectFilters>>(
    () => ({
      searchTerm: { defaultValue: '', param: 'q' },
      statusFilter: { defaultValue: 'all', param: 'status' },
      releaseIdsFilter: { defaultValue: [], param: 'release' },
    }),
    [],
  );
  const {
    filters,
    favorites,
    updateFilter,
    resetFilters,
    saveFavorite,
    applyFavorite,
    removeFavorite,
  } = usePersistentPageFilters('projects', filterDefinitions);

  const editingProject = useMemo(
    () => data.projects.find((project) => project.id === editingProjectId),
    [data.projects, editingProjectId],
  );
  const validationSchema = useMemo(
    () => createProjectFormSchema(data.projects, editingProjectId),
    [data.projects, editingProjectId],
  );
  const sortedProjects = useMemo(() => sortProjects(data.projects), [data.projects]);
  const releaseOptions = useMemo(() => sortReleasesForSelection(data.releases), [data.releases]);
  const releaseLookup = useMemo(
    () => new Map(data.releases.map((release) => [release.id, release])),
    [data.releases],
  );
  const projectReleaseIdsByProjectId = useMemo(() => {
    const lookup = new Map<string, string[]>();

    for (const link of data.projectReleases) {
      const current = lookup.get(link.projectId) ?? [];
      current.push(link.releaseId);
      lookup.set(link.projectId, current);
    }

    return lookup;
  }, [data.projectReleases]);
  const projectRows = useMemo(() => {
    const normalizedSearch = filters.searchTerm.trim().toUpperCase();

    return sortedProjects.filter((project) => {
      const matchesStatus =
        filters.statusFilter === 'all' || project.status === filters.statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        project.code.includes(normalizedSearch) ||
        project.name.toUpperCase().includes(normalizedSearch);
      const projectReleaseIds = projectReleaseIdsByProjectId.get(project.id) ?? [];
      const matchesReleaseFilter =
        filters.releaseIdsFilter.length === 0 ||
        projectReleaseIds.some((releaseId) => filters.releaseIdsFilter.includes(releaseId));

      return matchesStatus && matchesSearch && matchesReleaseFilter;
    });
  }, [
    filters.releaseIdsFilter,
    filters.searchTerm,
    filters.statusFilter,
    projectReleaseIdsByProjectId,
    sortedProjects,
  ]);
  const filterFields = useMemo<FilterBarField[]>(
    () => [
      {
        type: 'search',
        key: 'searchTerm',
        label: 'Search projects',
        value: filters.searchTerm,
        placeholder: 'Search by code or name',
        onChange: (value) => updateFilter('searchTerm', value),
      },
      {
        type: 'single-select',
        key: 'statusFilter',
        label: 'Status filter',
        value: filters.statusFilter,
        options: [
          { value: 'all', label: 'All statuses' },
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ],
        onChange: (value) => updateFilter('statusFilter', value as StatusFilter),
      },
      {
        type: 'multi-select',
        key: 'releaseIdsFilter',
        label: 'Linked releases',
        values: filters.releaseIdsFilter,
        options: releaseOptions.map((release) => ({
          value: release.id,
          label: release.name,
        })),
        onChange: (value) => updateFilter('releaseIdsFilter', value),
      },
    ],
    [
      filters.releaseIdsFilter,
      filters.searchTerm,
      filters.statusFilter,
      releaseOptions,
      updateFilter,
    ],
  );

  const form = useForm<ProjectFormValues>({
    defaultValues: createProjectDefaultValues(),
    resolver: createZodResolver(validationSchema),
  });

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const requestId = ++loadRequestIdRef.current;

    try {
      const [projects, releases, projectReleases, groups, demandSnapshots, allocations] =
        await Promise.all([
          projectsRepository.getAll(),
          releasesRepository.getAll(),
          projectReleasesRepository.getAll(),
          groupsRepository.getAll(),
          demandSnapshotsRepository.getAll(),
          allocationsRepository.getAll(),
        ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({
        projects,
        releases,
        projectReleases,
        groups,
        demandSnapshots,
        allocations,
      });
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  async function handleSubmit(values: ProjectFormValues) {
    setSubmitting(true);
    setFeedback('');

    try {
      const timestamp = nowIso();
      const projectId = editingProject?.id ?? crypto.randomUUID();
      const nextProject: Project = editingProject
        ? {
            ...editingProject,
            code: values.code,
            name: values.name.trim(),
            status: values.status,
            updatedAt: timestamp,
          }
        : {
            id: projectId,
            code: values.code,
            name: values.name.trim(),
            status: values.status,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      await projectsRepository.put(nextProject);
      await syncProjectReleaseLinks(projectId, values.releaseIds, data.projectReleases, timestamp);

      if (editingProject) {
        const migrationPlan = buildProjectCodeMigrationPlan(
          editingProject,
          nextProject.code,
          {
            demandSnapshots: data.demandSnapshots,
            allocations: data.allocations,
          },
          timestamp,
        );

        await Promise.all([
          ...migrationPlan.demandSnapshots.map((snapshot) =>
            demandSnapshotsRepository.put(snapshot),
          ),
          ...migrationPlan.allocations.map((allocation) => allocationsRepository.put(allocation)),
        ]);
      }

      await loadData();
      setEditingProjectId(projectId);
      form.reset({
        code: nextProject.code,
        name: nextProject.name,
        status: nextProject.status,
        releaseIds: [...values.releaseIds],
      });
      setIsFormOpen(false);
      setFeedback(editingProject ? 'Project updated.' : 'Project created.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save project.');
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
        const links = data.projectReleases.filter(
          (projectRelease) => projectRelease.projectId === pendingAction.project.id,
        );

        await Promise.all(
          links.map((projectRelease) => projectReleasesRepository.delete(projectRelease.id)),
        );
        await projectsRepository.delete(pendingAction.project.id);

        if (editingProjectId === pendingAction.project.id) {
          setEditingProjectId(undefined);
          form.reset(createProjectDefaultValues());
        }

        setFeedback('Project deleted permanently.');
      } else {
        await projectsRepository.put({
          ...pendingAction.project,
          status: pendingAction.type === 'archive' ? 'archived' : 'active',
          updatedAt: nowIso(),
        });
        setFeedback(pendingAction.type === 'archive' ? 'Project archived.' : 'Project restored.');
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
  const currentReferenceCount = editingProject
    ? countProjectReferences(
        {
          demandSnapshots: data.demandSnapshots,
          allocations: data.allocations,
        },
        editingProject.code,
      )
    : 0;
  const linkedReleaseIds = getProjectReleaseIds(data.projectReleases, editingProject?.id);
  const linkedReleases = linkedReleaseIds
    .map((releaseId) => releaseLookup.get(releaseId))
    .filter((release): release is Release => Boolean(release));

  return (
    <div className="flex w-full flex-col gap-6 p-6" id="projects-page">
      <PageHeader
        description="Maintain project codes, statuses, and release links. Projects are matched by normalized uppercase code only; linked demand snapshots and allocations prevent permanent deletion."
        icon={FolderKanban}
        title="Projects"
      />

      <FeedbackMessage message={feedback} />

      <section>
        <Card>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Project list</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Filter and open a project to review details or edit it.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditingProjectId(undefined);
                form.reset(createProjectDefaultValues());
                setIsFormOpen(true);
              }}
            >
              <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
              New project
            </Button>
          </div>

          <div className="mb-4">
            <FilterBar
              favorites={favorites}
              fields={filterFields}
              onApplyFavorite={applyFavorite}
              onDeleteFavorite={removeFavorite}
              onReset={resetFilters}
              onSaveFavorite={saveFavorite}
              resultsSummary={`${projectRows.length} project(s)`}
            />
          </div>

          {loading ? (
            <Skeleton label="Loading projects…" lines={4} />
          ) : (
            <TableShell caption="Projects with linked releases, references, and actions." zebra>
              <thead>
                <tr className="border-b border-[var(--surf-divider)]">
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Code
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Name
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Status
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Releases
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
                {projectRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4" colSpan={6}>
                      <EmptyState
                        icon={FolderKanban}
                        title="No projects match the current filters."
                      />
                    </td>
                  </tr>
                ) : null}

                {projectRows.map((project) => {
                  const referenceCount = countProjectReferences(
                    {
                      demandSnapshots: data.demandSnapshots,
                      allocations: data.allocations,
                    },
                    project.code,
                  );
                  const releaseCount = getProjectReleaseIds(
                    data.projectReleases,
                    project.id,
                  ).length;
                  const canDelete = referenceCount === 0;

                  return (
                    <tr
                      className="border-b border-[var(--surf-divider)] align-top"
                      key={project.id}
                    >
                      <td className="px-3 py-3 font-medium">{project.code}</td>
                      <td className="px-3 py-3">{project.name}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                            project.status === 'active'
                              ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                              : 'border-[var(--status-caution-border)] bg-[var(--status-caution-bg)] text-[var(--status-caution-text)]'
                          }`}
                        >
                          {project.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">{releaseCount}</td>
                      <td className="px-3 py-3">{referenceCount}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditingProjectId(project.id);
                              form.reset(createProjectDefaultValues(project, data.projectReleases));
                              setIsFormOpen(true);
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
                                type: project.status === 'active' ? 'archive' : 'restore',
                                project,
                                referenceCount,
                                releaseCount,
                              })
                            }
                          >
                            <RotateCcw aria-hidden="true" size={14} strokeWidth={2.25} />
                            {project.status === 'active' ? 'Archive' : 'Restore'}
                          </Button>
                          {canDelete ? (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                setPendingAction({
                                  type: 'delete',
                                  project,
                                  referenceCount,
                                  releaseCount,
                                })
                              }
                            >
                              <Trash2 aria-hidden="true" size={14} strokeWidth={2.25} />
                              Delete permanently
                            </Button>
                          ) : (
                            <span className="text-xs text-[var(--text-secondary)]">
                              Archive only: project still has demand/allocation references.
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

      <Drawer
        description={
          editingProject
            ? 'Update code, name, status, and release links. Code changes cascade to stored project references.'
            : 'Create a project using a valid functional code such as E0100, P1234, or R0016.'
        }
        headerActions={
          editingProject ? (
            <Button
              className="underline"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingProjectId(undefined);
                form.reset(createProjectDefaultValues());
              }}
            >
              Clear
            </Button>
          ) : null
        }
        onClose={() => setIsFormOpen(false)}
        open={isFormOpen}
        title={editingProject ? 'Project details' : 'Create project'}
      >
        {editingProject ? (
          <dl className="mb-5 grid gap-3 rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-medium text-[var(--text-secondary)]">
                Demand/allocation references
              </dt>
              <dd className="mt-1 text-lg font-semibold">{currentReferenceCount}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--text-secondary)]">Linked releases</dt>
              <dd className="mt-1 text-lg font-semibold">{linkedReleases.length}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--text-secondary)]">Last updated</dt>
              <dd className="mt-1">{editingProject.updatedAt}</dd>
            </div>
          </dl>
        ) : null}

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
            <label className="mb-1 block text-sm font-medium" htmlFor="project-code">
              Project code
            </label>
            <input
              className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2 uppercase"
              id="project-code"
              type="text"
              {...form.register('code')}
            />
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Must match ^[EPR]\d{4}$ and is compared case-insensitively.
            </p>
            {form.formState.errors.code ? (
              <p className="mt-1 text-sm text-red-400" role="alert">
                {form.formState.errors.code.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="project-name">
              Project name
            </label>
            <input
              className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
              id="project-name"
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
            <label className="mb-1 block text-sm font-medium" htmlFor="project-status">
              Status
            </label>
            <select
              className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
              id="project-status"
              {...form.register('status')}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <fieldset className="rounded-lg border border-[var(--surf-divider)] p-4">
            <legend className="px-1 text-sm font-medium">Associated releases</legend>
            {releaseOptions.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No releases available yet. Create releases in the Releases feature, then link them
                here.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {releaseOptions.map((release) => (
                  <label
                    className="flex items-start gap-3 rounded-md border border-[var(--surf-divider)] p-3"
                    key={release.id}
                  >
                    <input
                      className="mt-1"
                      type="checkbox"
                      value={release.id}
                      {...form.register('releaseIds')}
                    />
                    <span className="space-y-1 text-sm">
                      <span className="block font-medium">{release.name}</span>
                      <span className="block text-[var(--text-secondary)]">
                        Go-live {release.goLiveDate} · {release.status}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {editingProject ? (
            <section className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4">
              <h3 className="text-sm font-semibold">Linked release summary</h3>
              {linkedReleases.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">No releases linked.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {linkedReleases.map((release) => (
                    <li key={release.id}>
                      <span className="font-medium">{release.name}</span> — {release.goLiveDate}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <Button disabled={submitting} type="submit">
            {submitting ? 'Saving…' : editingProject ? 'Save changes' : 'Create project'}
          </Button>
        </form>
      </Drawer>

      <section>
        <Card>
          <h2 className="text-xl font-semibold">Imported groups snapshot</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Group entities are imported read-only. Use the dedicated Groups page for the full list
            and details.
          </p>
          <div className="mt-4">
            <TableShell caption="Imported groups summary." zebra>
              <thead>
                <tr className="border-b border-[var(--surf-divider)]">
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Code
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Label
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.groups.slice(0, 5).map((group) => (
                  <tr className="border-b border-[var(--surf-divider)]" key={group.id}>
                    <td className="px-3 py-3 font-medium">{group.code}</td>
                    <td className="px-3 py-3">{group.label}</td>
                    <td className="px-3 py-3">{group.status}</td>
                  </tr>
                ))}
                {data.groups.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4" colSpan={3}>
                      <EmptyState icon={FolderTree} title="No imported groups are stored yet." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </TableShell>
          </div>
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
                  ? `Delete project ${pendingAction.project.code} permanently?`
                  : pendingAction.type === 'archive'
                    ? `Archive project ${pendingAction.project.code}?`
                    : `Restore project ${pendingAction.project.code}?`}
              </p>
              <p className="mt-2">
                Linked releases: {pendingAction.releaseCount}. Demand/allocation references:{' '}
                {pendingAction.referenceCount}.
              </p>
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
            ? 'Delete project'
            : pendingAction?.type === 'archive'
              ? 'Archive project'
              : 'Restore project'
        }
        tone={pendingAction?.type === 'delete' ? 'danger' : 'default'}
      />
    </div>
  );
}
