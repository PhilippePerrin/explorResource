import { memo, type ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';

import { DemandCoverageBadge } from '@/components/DemandCoverageBadge';
import { FeedbackMessage } from '@/components/FeedbackMessage';
import { MetricCard } from '@/components/MetricCard';
import { UtilizationBadge } from '@/components/UtilizationBadge';
import { buildResourceMonthSummary } from '@/domain/calculations';
import type {
  Allocation,
  AppSettings,
  DemandSnapshot,
  Project,
  Resource,
  ResourceNonWorkingDays,
  ResourceType,
  WorkingDaysCalendar,
} from '@/domain/entities';
import { getResourceFullName, isAllocationResourceTypeCompatible } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';

import {
  allocationChangeSchema,
  applyAllocationChange,
  buildAllocationStudioRows,
  buildSimulationPreview,
  commitAllocationStudioHistory,
  copyMonthAllocations,
  createAllocationStudioHistory,
  redoAllocationStudioHistory,
  type AllocationChangeValues,
  type AllocationSimulationPreview,
  undoAllocationStudioHistory,
} from './allocationStudioModel';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const projectsRepository = createRepository('projects');
const allocationsRepository = createRepository('allocations');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const workingDaysRepository = createRepository('workingDaysCalendars');
const resourceNonWorkingDaysRepository = createRepository('resourceNonWorkingDays');
const appSettingsRepository = createRepository('appSettings');

interface AllocationStudioData {
  resources: Resource[];
  resourceTypes: ResourceType[];
  projects: Project[];
  allocations: Allocation[];
  demandSnapshots: DemandSnapshot[];
  workingDaysCalendars: WorkingDaysCalendar[];
  resourceNonWorkingDays: ResourceNonWorkingDays[];
  appSettings: AppSettings | null;
}

function formatDayAmount(value: number, displayPrecision = 1): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: displayPrecision,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, displayPrecision),
  }).format(value);
}

function buildDemandCoverageTooltip(
  demandDays: number,
  allocatedDays: number,
  remainingDemandDays: number,
  overServiceDays: number,
  displayPrecision: number,
) {
  return `Demand ${formatDayAmount(demandDays, displayPrecision)} d, covered ${formatDayAmount(allocatedDays, displayPrecision)} d, gap ${formatDayAmount(remainingDemandDays, displayPrecision)} d, over-service ${formatDayAmount(overServiceDays, displayPrecision)} d.`;
}

function createResolver(
  resources: readonly Resource[],
  projects: readonly Project[],
  resourceTypes: readonly ResourceType[],
): Resolver<AllocationChangeValues> {
  return async (values) => {
    const result = allocationChangeSchema.safeParse(values);

    if (!result.success) {
      const errors: Record<string, { type: string; message: string }> = {};

      for (const issue of result.error.issues) {
        const path = issue.path.join('.');

        if (!path || errors[path]) {
          continue;
        }

        errors[path] = { type: issue.code, message: issue.message };
      }

      return { values: {}, errors };
    }

    const typedErrors: Record<string, { type: string; message: string }> = {};
    const resource = resources.find((candidate) => candidate.id === result.data.resourceId);

    if (!resource) {
      typedErrors.resourceId = { type: 'custom', message: 'Select a valid resource.' };
    }

    if (!projects.some((project) => project.code === result.data.projectCode.toUpperCase())) {
      typedErrors.projectCode = { type: 'custom', message: 'Select a valid project.' };
    }

    if (!resourceTypes.some((resourceType) => resourceType.id === result.data.resourceTypeId)) {
      typedErrors.resourceTypeId = { type: 'custom', message: 'Select a valid resource type.' };
    }

    if (
      resource &&
      !isAllocationResourceTypeCompatible(resource, {
        resourceTypeId: result.data.resourceTypeId,
      })
    ) {
      typedErrors.resourceTypeId = {
        type: 'custom',
        message: 'Resource type must match the selected resource.',
      };
    }

    if (Object.keys(typedErrors).length > 0) {
      return { values: {}, errors: typedErrors };
    }

    return { values: result.data, errors: {} };
  };
}

function getErrorSummary(errors: FieldErrors<AllocationChangeValues>): string[] {
  return Object.values(errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));
}

function DraggableTokenComponent(props: {
  id: string;
  label: string;
  data: Record<string, unknown>;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: props.id,
    data: props.data,
  });

  return (
    <button
      ref={setNodeRef}
      className="rounded-md border border-[var(--color-bmx-blue)] px-3 py-2 text-left text-xs"
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      type="button"
      {...attributes}
      {...listeners}
    >
      {props.label}
    </button>
  );
}

const DraggableToken = memo(DraggableTokenComponent);

interface DroppableProjectCellProps {
  id: string;
  activationLabel: string;
  onActivate?: () => void;
  children: ReactNode;
}

function DroppableProjectCellComponent({
  id,
  activationLabel,
  onActivate,
  children,
}: DroppableProjectCellProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[12rem] rounded-lg border p-2 text-xs ${
        isOver
          ? 'border-[var(--color-bmx-blue)] bg-[var(--surf-600)]'
          : 'border-[var(--surf-divider)] bg-[var(--surf-700)]'
      }`}
    >
      {onActivate ? (
        <button
          aria-label={activationLabel}
          className="mb-2 rounded-md border border-[var(--color-bmx-blue)] px-2 py-1 text-left text-[11px] font-medium"
          onClick={onActivate}
          type="button"
        >
          Apply prepared token here
        </button>
      ) : null}
      {children}
    </div>
  );
}

const DroppableProjectCell = memo(DroppableProjectCellComponent);

export function AllocationStudioPage() {
  const now = new Date();
  const [data, setData] = useState<AllocationStudioData>({
    resources: [],
    resourceTypes: [],
    projects: [],
    allocations: [],
    demandSnapshots: [],
    workingDaysCalendars: [],
    resourceNonWorkingDays: [],
    appSettings: null,
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [projectSearch, setProjectSearch] = useState('');
  const [history, setHistory] = useState(() => createAllocationStudioHistory([]));
  const [simulation, setSimulation] = useState<AllocationSimulationPreview | null>(null);
  const [dragDraft, setDragDraft] = useState({
    resourceId: '',
    month: now.getMonth() + 1,
    allocatedDays: 1,
  });
  const [copySourceMonth, setCopySourceMonth] = useState(1);
  const [copyTargetMonth, setCopyTargetMonth] = useState(2);
  const loadRequestIdRef = useRef(0);

  const resolver = useMemo(
    () => createResolver(data.resources, data.projects, data.resourceTypes),
    [data.projects, data.resourceTypes, data.resources],
  );
  const form = useForm<AllocationChangeValues>({
    defaultValues: {
      mode: 'add',
      resourceId: '',
      sourceProjectCode: '',
      projectCode: '',
      resourceTypeId: '',
      year,
      month: dragDraft.month,
      allocatedDays: 1,
    },
    resolver,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const requestId = ++loadRequestIdRef.current;

    try {
      const [
        resources,
        resourceTypes,
        projects,
        allocations,
        demandSnapshots,
        workingDaysCalendars,
        resourceNonWorkingDays,
        appSettings,
      ] = await Promise.all([
        resourcesRepository.getAll(),
        resourceTypesRepository.getAll(),
        projectsRepository.getAll(),
        allocationsRepository.getAll(),
        demandSnapshotsRepository.getAll(),
        workingDaysRepository.getAll(),
        resourceNonWorkingDaysRepository.getAll(),
        appSettingsRepository.getById('app-settings'),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({
        resources,
        resourceTypes,
        projects,
        allocations,
        demandSnapshots,
        workingDaysCalendars,
        resourceNonWorkingDays,
        appSettings: appSettings ?? null,
      });
      setHistory(createAllocationStudioHistory(allocations));

      const defaultResourceTypeId = resourceTypes[0]?.id ?? 'all';
      setResourceTypeFilter(defaultResourceTypeId);
      form.reset({
        mode: 'add',
        resourceId: '',
        sourceProjectCode: '',
        projectCode: '',
        resourceTypeId: defaultResourceTypeId === 'all' ? '' : defaultResourceTypeId,
        year,
        month: dragDraft.month,
        allocatedDays: 1,
      });
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Unable to load allocation studio data.',
      );
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [dragDraft.month, form, year]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    form.setValue('year', year);
  }, [form, year]);

  const displayPrecision = data.appSettings?.displayPrecision ?? 1;
  const filteredResources = useMemo(
    () =>
      data.resources.filter(
        (resource) =>
          resource.status === 'active' &&
          (resourceTypeFilter === 'all' || resource.resourceTypeId === resourceTypeFilter),
      ),
    [data.resources, resourceTypeFilter],
  );
  const boardRows = useMemo(
    () =>
      buildAllocationStudioRows({
        projects: data.projects,
        resourceTypes: data.resourceTypes,
        resources: data.resources,
        demandSnapshots: data.demandSnapshots,
        allocations: history.present,
        year,
        resourceTypeFilter,
        projectSearch,
      }),
    [
      data.demandSnapshots,
      data.projects,
      data.resourceTypes,
      data.resources,
      history.present,
      projectSearch,
      resourceTypeFilter,
      year,
    ],
  );
  const yearOptions = useMemo(() => {
    const years = new Set<number>([year]);

    for (const allocation of data.allocations) {
      years.add(allocation.year);
    }

    for (const snapshot of data.demandSnapshots) {
      years.add(snapshot.year);
    }

    return [...years].sort((left, right) => left - right);
  }, [data.allocations, data.demandSnapshots, year]);
  const resourcePanelRows = useMemo(
    () =>
      filteredResources.map((resource) => ({
        resource,
        summary: buildResourceMonthSummary({
          resource,
          year,
          month: dragDraft.month,
          workingDaysCalendars: data.workingDaysCalendars,
          resourceNonWorkingDays: data.resourceNonWorkingDays,
          allocations: history.present,
          appSettings: data.appSettings,
        }),
      })),
    [
      data.appSettings,
      data.resourceNonWorkingDays,
      data.workingDaysCalendars,
      dragDraft.month,
      filteredResources,
      history.present,
      year,
    ],
  );
  const formErrors = getErrorSummary(form.formState.errors);

  const simulateChange = useCallback(
    (values: AllocationChangeValues) => {
      const simulatedAllocations = applyAllocationChange(history.present, values);
      const preview = buildSimulationPreview({
        currentAllocations: history.present,
        simulatedAllocations,
        change: values,
        resources: data.resources,
        workingDaysCalendars: data.workingDaysCalendars,
        resourceNonWorkingDays: data.resourceNonWorkingDays,
        appSettings: data.appSettings,
        demandSnapshots: data.demandSnapshots,
      });

      setSimulation(preview);

      return { simulatedAllocations, preview };
    },
    [
      data.appSettings,
      data.demandSnapshots,
      data.resourceNonWorkingDays,
      data.resources,
      data.workingDaysCalendars,
      history.present,
    ],
  );

  async function handleSimulate(values: AllocationChangeValues) {
    simulateChange(values);
    setFeedback('Simulation updated. Review utilization and coverage before saving.');
  }

  async function handleQueue(values: AllocationChangeValues) {
    const { simulatedAllocations } = simulateChange(values);
    setHistory((current) => commitAllocationStudioHistory(current, simulatedAllocations));
    setFeedback('Draft allocation queued. Save draft to persist changes.');
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    const dragData = event.active.data.current;

    if (!overId || !dragData || typeof overId !== 'string' || !overId.startsWith('drop::')) {
      return;
    }

    const [, projectCode = '', resourceTypeId = '', yearToken = '', monthToken = ''] =
      overId.split('::');
    const yearValue = Number(yearToken);
    const monthValue = Number(monthToken);

    if (dragData.kind === 'new-allocation') {
      const values: AllocationChangeValues = {
        mode: 'add',
        resourceId: String(dragData.resourceId),
        sourceProjectCode: '',
        projectCode,
        resourceTypeId,
        year: yearValue,
        month: monthValue,
        allocatedDays: Number(dragData.allocatedDays),
      };
      const { simulatedAllocations } = simulateChange(values);
      setHistory((current) => commitAllocationStudioHistory(current, simulatedAllocations));
      setFeedback('Draft allocation added from drag-and-drop. Save draft to commit changes.');
      return;
    }

    if (dragData.kind === 'existing-allocation') {
      const values: AllocationChangeValues = {
        mode: 'move',
        resourceId: String(dragData.resourceId),
        sourceProjectCode: String(dragData.projectCode),
        projectCode,
        resourceTypeId,
        year: yearValue,
        month: monthValue,
        allocatedDays: Number(dragData.allocatedDays),
      };
      const { simulatedAllocations } = simulateChange(values);
      setHistory((current) => commitAllocationStudioHistory(current, simulatedAllocations));
      setFeedback('Draft allocation moved. Save draft to commit changes.');
    }
  }

  async function handleSaveDraft() {
    const originalById = new Map(data.allocations.map((allocation) => [allocation.id, allocation]));
    const draftById = new Map(history.present.map((allocation) => [allocation.id, allocation]));

    try {
      const deletions = data.allocations
        .filter((allocation) => !draftById.has(allocation.id))
        .map((allocation) => allocationsRepository.delete(allocation.id));
      const upserts = history.present
        .filter((allocation) => {
          const original = originalById.get(allocation.id);

          return !original || JSON.stringify(original) !== JSON.stringify(allocation);
        })
        .map((allocation) =>
          allocationsRepository.put({
            ...allocation,
            updatedAt: new Date().toISOString(),
          }),
        );

      await Promise.all([...deletions, ...upserts]);
      setFeedback('Allocation draft saved.');
      setSimulation(null);
      await loadData();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save allocation draft.');
    }
  }

  function handleCopyMonth() {
    const next = copyMonthAllocations({
      allocations: history.present,
      year,
      sourceMonth: copySourceMonth,
      targetMonth: copyTargetMonth,
      resourceTypeId: resourceTypeFilter === 'all' ? undefined : resourceTypeFilter,
    });

    setHistory((current) => commitAllocationStudioHistory(current, next));
    setFeedback('Month copied into the current draft. Save draft to persist changes.');
  }

  const applyPreparedTokenToCell = useCallback(
    (projectCode: string, targetResourceTypeId: string, month: number) => {
      if (!dragDraft.resourceId) {
        setFeedback(
          'Select a resource in the drag token panel before using keyboard drop targets.',
        );
        return;
      }

      const values: AllocationChangeValues = {
        mode: 'add',
        resourceId: dragDraft.resourceId,
        sourceProjectCode: '',
        projectCode,
        resourceTypeId: targetResourceTypeId,
        year,
        month,
        allocatedDays: dragDraft.allocatedDays,
      };
      const { simulatedAllocations } = simulateChange(values);
      setHistory((current) => commitAllocationStudioHistory(current, simulatedAllocations));
      setFeedback(
        `Prepared allocation added to ${projectCode} for month ${month}. Save draft to commit changes.`,
      );
    },
    [dragDraft.allocatedDays, dragDraft.resourceId, simulateChange, year],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6" id="allocation-studio-page">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Allocation Studio</h1>
        <p className="max-w-4xl text-sm text-[var(--text-secondary)]">
          Interactive allocation drafting with drag-and-drop, a full keyboard form alternative,
          simulation before commit, month copy, and undo/redo.
        </p>
      </header>

      <FeedbackMessage message={feedback} />

      <section className="grid gap-4 lg:grid-cols-4">
        <label className="text-sm font-medium" htmlFor="studio-year">
          Year
          <select
            className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-800)] px-3 py-2"
            id="studio-year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {yearOptions.map((optionYear) => (
              <option key={optionYear} value={optionYear}>
                {optionYear}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium" htmlFor="studio-type">
          Resource type
          <select
            className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-800)] px-3 py-2"
            id="studio-type"
            value={resourceTypeFilter}
            onChange={(event) => {
              setResourceTypeFilter(event.target.value);
              form.setValue(
                'resourceTypeId',
                event.target.value === 'all' ? '' : event.target.value,
              );
            }}
          >
            <option value="all">All</option>
            {data.resourceTypes.map((resourceType) => (
              <option key={resourceType.id} value={resourceType.id}>
                {resourceType.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium" htmlFor="studio-search">
          Project search
          <input
            className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-800)] px-3 py-2"
            id="studio-search"
            type="search"
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            className="rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm"
            disabled={history.past.length === 0}
            onClick={() => setHistory((current) => undoAllocationStudioHistory(current))}
            type="button"
          >
            Undo
          </button>
          <button
            className="rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm"
            disabled={history.future.length === 0}
            onClick={() => setHistory((current) => redoAllocationStudioHistory(current))}
            type="button"
          >
            Redo
          </button>
          <button
            className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm text-white"
            onClick={() => {
              void handleSaveDraft();
            }}
            type="button"
          >
            Save draft
          </button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <section className="space-y-6">
          <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
            <h2 className="text-xl font-semibold">Resources panel</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Available capacity for month {dragDraft.month}. Use it to prepare drag allocations.
            </p>
            <ul className="mt-4 space-y-3">
              {resourcePanelRows.length === 0 ? (
                <li className="text-sm text-[var(--text-secondary)]">
                  No active resource matches the current resource-type filter.
                </li>
              ) : (
                resourcePanelRows.map(({ resource, summary }) => (
                  <li
                    className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-3"
                    key={resource.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{getResourceFullName(resource)}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Available{' '}
                          {formatDayAmount(summary.availableCapacityDays, displayPrecision)} d · Net{' '}
                          {formatDayAmount(summary.netCapacityDays, displayPrecision)} d
                        </p>
                      </div>
                      <UtilizationBadge
                        compact
                        displayPrecision={displayPrecision}
                        tooltip={`${getResourceFullName(resource)} month ${dragDraft.month}: ${formatDayAmount(summary.assignedLoadDays, displayPrecision)} allocated days over ${formatDayAmount(summary.netCapacityDays, displayPrecision)} net capacity days.`}
                        utilization={summary.utilization}
                      />
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
            <h2 className="text-xl font-semibold">Keyboard allocation form</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Fully keyboard-operable alternative to drag-and-drop.
            </p>
            {formErrors.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
                {formErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
            <form className="mt-4 space-y-3" onSubmit={form.handleSubmit(handleQueue)}>
              <label className="block text-sm font-medium" htmlFor="studio-mode">
                Change mode
                <select
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="studio-mode"
                  {...form.register('mode')}
                >
                  <option value="add">Add to allocation</option>
                  <option value="set">Set allocation exactly</option>
                  <option value="move">Move from another project</option>
                </select>
              </label>
              <label className="block text-sm font-medium" htmlFor="studio-resource">
                Resource
                <select
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="studio-resource"
                  {...form.register('resourceId')}
                >
                  <option value="">Select a resource</option>
                  {filteredResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {getResourceFullName(resource)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium" htmlFor="studio-source-project">
                Source project (for move)
                <select
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="studio-source-project"
                  {...form.register('sourceProjectCode')}
                >
                  <option value="">None</option>
                  {data.projects.map((project) => (
                    <option key={project.id} value={project.code}>
                      {project.code} — {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium" htmlFor="studio-project">
                Target project
                <select
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="studio-project"
                  {...form.register('projectCode')}
                >
                  <option value="">Select a project</option>
                  {data.projects.map((project) => (
                    <option key={project.id} value={project.code}>
                      {project.code} — {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium" htmlFor="studio-form-type">
                Resource type
                <select
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="studio-form-type"
                  {...form.register('resourceTypeId')}
                >
                  <option value="">Select a resource type</option>
                  {data.resourceTypes.map((resourceType) => (
                    <option key={resourceType.id} value={resourceType.id}>
                      {resourceType.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-medium" htmlFor="studio-form-year">
                  Year
                  <input
                    className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                    id="studio-form-year"
                    type="number"
                    {...form.register('year', { valueAsNumber: true })}
                  />
                </label>
                <label className="block text-sm font-medium" htmlFor="studio-form-month">
                  Month
                  <select
                    className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                    id="studio-form-month"
                    {...form.register('month', { valueAsNumber: true })}
                  >
                    {Array.from({ length: 12 }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium" htmlFor="studio-form-days">
                  Days
                  <input
                    className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                    id="studio-form-days"
                    step="0.1"
                    type="number"
                    {...form.register('allocatedDays', { valueAsNumber: true })}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-[var(--color-bmx-blue)] px-4 py-2 text-sm"
                  onClick={form.handleSubmit(handleSimulate)}
                  type="button"
                >
                  Simulate change
                </button>
                <button
                  className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm text-white"
                  type="submit"
                >
                  Queue change
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
            <h2 className="text-xl font-semibold">Drag token</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="text-sm font-medium" htmlFor="drag-resource">
                Resource
                <select
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="drag-resource"
                  value={dragDraft.resourceId}
                  onChange={(event) =>
                    setDragDraft((current) => ({ ...current, resourceId: event.target.value }))
                  }
                >
                  <option value="">Select</option>
                  {filteredResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {getResourceFullName(resource)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium" htmlFor="drag-month">
                Month
                <select
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="drag-month"
                  value={dragDraft.month}
                  onChange={(event) =>
                    setDragDraft((current) => ({
                      ...current,
                      month: Number(event.target.value),
                    }))
                  }
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium" htmlFor="drag-days">
                Days
                <input
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="drag-days"
                  min="0"
                  step="0.1"
                  type="number"
                  value={dragDraft.allocatedDays}
                  onChange={(event) =>
                    setDragDraft((current) => ({
                      ...current,
                      allocatedDays: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <div className="mt-4">
              {dragDraft.resourceId ? (
                <DraggableToken
                  data={{
                    kind: 'new-allocation',
                    resourceId: dragDraft.resourceId,
                    allocatedDays: dragDraft.allocatedDays,
                  }}
                  id={`drag-token-${dragDraft.resourceId}`}
                  label={`Drag ${formatDayAmount(dragDraft.allocatedDays, displayPrecision)} d onto a project cell`}
                />
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Select a resource to enable drag-and-drop allocation.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
            <h2 className="text-xl font-semibold">Copy month → month</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium" htmlFor="copy-source-month">
                Source month
                <select
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="copy-source-month"
                  value={copySourceMonth}
                  onChange={(event) => setCopySourceMonth(Number(event.target.value))}
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium" htmlFor="copy-target-month">
                Target month
                <select
                  className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
                  id="copy-target-month"
                  value={copyTargetMonth}
                  onChange={(event) => setCopyTargetMonth(Number(event.target.value))}
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="mt-4 rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm"
              onClick={handleCopyMonth}
              type="button"
            >
              Copy month into draft
            </button>
          </section>
        </section>

        <section className="space-y-6">
          <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
            <h2 className="text-xl font-semibold">Simulation preview</h2>
            {simulation ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <MetricCard
                  title="Resource utilization after change"
                  value={`${formatDayAmount(
                    simulation.afterResourceSummary.assignedLoadDays,
                    displayPrecision,
                  )} d assigned`}
                  hint={`Before: ${formatDayAmount(
                    simulation.beforeResourceSummary.assignedLoadDays,
                    displayPrecision,
                  )} d · Available after: ${formatDayAmount(
                    simulation.afterResourceSummary.availableCapacityDays,
                    displayPrecision,
                  )} d`}
                  accent={
                    <UtilizationBadge
                      compact
                      displayPrecision={displayPrecision}
                      tooltip={`After simulation: ${formatDayAmount(
                        simulation.afterResourceSummary.assignedLoadDays,
                        displayPrecision,
                      )} allocated days over ${formatDayAmount(
                        simulation.afterResourceSummary.netCapacityDays,
                        displayPrecision,
                      )} net capacity days.`}
                      utilization={simulation.afterResourceSummary.utilization}
                    />
                  }
                />
                <MetricCard
                  title="Demand coverage after change"
                  value={`${formatDayAmount(
                    simulation.afterDemandSummary.coverageRatePercent,
                    displayPrecision,
                  )}% covered`}
                  hint={`Gap before/after: ${formatDayAmount(
                    simulation.beforeDemandSummary.remainingDemandDays,
                    displayPrecision,
                  )} d → ${formatDayAmount(
                    simulation.afterDemandSummary.remainingDemandDays,
                    displayPrecision,
                  )} d. Over-service after: ${formatDayAmount(
                    simulation.afterDemandSummary.overServiceDays,
                    displayPrecision,
                  )} d.`}
                  accent={
                    <DemandCoverageBadge
                      compact
                      displayPrecision={displayPrecision}
                      summary={simulation.afterDemandSummary}
                      tooltip={buildDemandCoverageTooltip(
                        simulation.afterDemandSummary.demandDays,
                        simulation.afterDemandSummary.allocatedDays,
                        simulation.afterDemandSummary.remainingDemandDays,
                        simulation.afterDemandSummary.overServiceDays,
                        displayPrecision,
                      )}
                    />
                  }
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                Run a simulation from the keyboard form or drag a token onto a project cell. Changes
                stay in draft until you save.
              </p>
            )}
          </section>

          <DndContext onDragEnd={handleDragEnd}>
            <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Allocation board</h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Drag a prepared resource token onto a project/month cell, or move an existing
                    allocation chip to another cell.
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Keyboard users can focus any board cell and press Enter or Space to apply the
                    prepared drag token, or use the keyboard allocation form for explicit add, set,
                    and move operations.
                  </p>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Draft rows: {boardRows.length}
                </p>
              </div>
              {loading ? (
                <p>Loading allocation board…</p>
              ) : boardRows.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  No board row matches the selected filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Allocation board by project and month, with keyboard-operable drop targets.
                    </caption>
                    <thead>
                      <tr className="border-b border-[var(--surf-divider)]">
                        <th className="px-3 py-2 font-semibold" scope="col">
                          Project
                        </th>
                        {Array.from({ length: 12 }, (_, index) => (
                          <th className="px-3 py-2 font-semibold" key={index + 1} scope="col">
                            {index + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {boardRows.map((row) => (
                        <tr
                          className="border-b border-[var(--surf-divider)] align-top"
                          key={`${row.projectCode}-${row.resourceTypeId}`}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium">{row.projectCode}</div>
                            <div className="text-[var(--text-secondary)]">{row.projectName}</div>
                            <div className="text-xs text-[var(--text-secondary)]">
                              {row.resourceTypeLabel}
                            </div>
                          </td>
                          {row.months.map((cell) => (
                            <td className="px-3 py-2" key={cell.month}>
                              <DroppableProjectCell
                                activationLabel={`${row.projectCode} ${row.projectName}, month ${cell.month}. Focus and press Enter or Space to apply the prepared drag token.`}
                                id={`drop::${row.projectCode}::${row.resourceTypeId}::${year}::${cell.month}`}
                                onActivate={() =>
                                  applyPreparedTokenToCell(
                                    row.projectCode,
                                    row.resourceTypeId,
                                    cell.month,
                                  )
                                }
                              >
                                <div className="mb-2">
                                  <DemandCoverageBadge
                                    compact
                                    displayPrecision={displayPrecision}
                                    summary={cell}
                                    tooltip={buildDemandCoverageTooltip(
                                      cell.demandDays,
                                      cell.allocatedDays,
                                      cell.remainingDemandDays,
                                      cell.overServiceDays,
                                      displayPrecision,
                                    )}
                                  />
                                </div>
                                <p className="font-medium">
                                  Demand {formatDayAmount(cell.demandDays, displayPrecision)} d
                                </p>
                                <p>
                                  Covered {formatDayAmount(cell.allocatedDays, displayPrecision)} d
                                </p>
                                <p>
                                  Gap {formatDayAmount(cell.remainingDemandDays, displayPrecision)}{' '}
                                  d
                                </p>
                                <p>
                                  Over-service{' '}
                                  {formatDayAmount(cell.overServiceDays, displayPrecision)} d
                                </p>
                                <div className="mt-2 space-y-1">
                                  {cell.allocations.map((allocation) => (
                                    <DraggableToken
                                      data={{
                                        kind: 'existing-allocation',
                                        resourceId: allocation.resourceId,
                                        projectCode: row.projectCode,
                                        allocatedDays: allocation.allocatedDays,
                                      }}
                                      id={`allocation-${allocation.id}`}
                                      key={allocation.id}
                                      label={`${allocation.resourceName}: ${formatDayAmount(
                                        allocation.allocatedDays,
                                        displayPrecision,
                                      )} d`}
                                    />
                                  ))}
                                </div>
                              </DroppableProjectCell>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </DndContext>
        </section>
      </section>
    </div>
  );
}
