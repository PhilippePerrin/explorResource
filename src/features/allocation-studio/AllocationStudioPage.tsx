import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useForm, type Resolver } from 'react-hook-form';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import { FilterBar, type FilterBarField } from '@/components/FilterBar';
import { Shuffle } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, TableShell } from '@/components/ui';
import type {
  Allocation,
  AppSettings,
  DemandSnapshot,
  ImportBatch,
  Project,
  Resource,
  ResourceNonWorkingDays,
  ResourceType,
  WorkingDaysCalendar,
} from '@/domain/entities';
import { getResourceFullName, isAllocationResourceTypeCompatible } from '@/domain/entities';
import { getFocusMonths, type CapacityFocus } from '@/features/capacity';
import { MONTH_LABELS } from '@/features/dashboard';
import { usePersistentPageFilters, type FilterDefinitions } from '@/features/filters/filterState';
import { getResourceTypeDisplayLabel } from '@/features/resource-types';
import { createRepository } from '@/persistence/repository';

import { AssignmentLineRow } from './AssignmentLineRow';
import { DemandLineRow } from './DemandLineRow';
import { MultiMonthAssignPanel } from './MultiMonthAssignPanel';
import { QuickAssignDrawer } from './QuickAssignDrawer';
import { ResourceBenchPanel } from './ResourceBenchPanel';
import {
  allocationChangeSchema,
  applyAllocationChange,
  applyAllocationChangeBatch,
  buildAllocationStudioBoardRows,
  buildAllocationStudioRows,
  buildBatchSimulationPreview,
  buildResourceBenchRows,
  buildSimulationPreview,
  commitAllocationStudioHistory,
  copyMonthAllocations,
  createAllocationStudioHistory,
  redoAllocationStudioHistory,
  resolveDefaultDropDays,
  resolveMultiMonthDropDays,
  undoAllocationStudioHistory,
  type AllocationBatchChangeValues,
  type AllocationBatchPreviewEntry,
  type AllocationChangeValues,
  type AllocationSimulationPreview,
} from './allocationStudioModel';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const projectsRepository = createRepository('projects');
const allocationsRepository = createRepository('allocations');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const workingDaysRepository = createRepository('workingDaysCalendars');
const resourceNonWorkingDaysRepository = createRepository('resourceNonWorkingDays');
const appSettingsRepository = createRepository('appSettings');
const importBatchesRepository = createRepository('importBatches');

interface AllocationStudioData {
  resources: Resource[];
  resourceTypes: ResourceType[];
  projects: Project[];
  allocations: Allocation[];
  demandSnapshots: DemandSnapshot[];
  workingDaysCalendars: WorkingDaysCalendar[];
  resourceNonWorkingDays: ResourceNonWorkingDays[];
  appSettings: AppSettings | null;
  importBatches: ImportBatch[];
}

interface AllocationStudioFilters {
  year: number;
  focus: CapacityFocus;
  resourceTypeFilter: string;
  projectSearch: string;
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

export function AllocationStudioPage() {
  const initialDate = useRef(new Date()).current;
  const [data, setData] = useState<AllocationStudioData>({
    resources: [],
    resourceTypes: [],
    projects: [],
    allocations: [],
    demandSnapshots: [],
    workingDaysCalendars: [],
    resourceNonWorkingDays: [],
    appSettings: null,
    importBatches: [],
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [history, setHistory] = useState(() => createAllocationStudioHistory([]));
  const [simulation, setSimulation] = useState<AllocationSimulationPreview | null>(null);
  const [armedResourceId, setArmedResourceId] = useState<string | null>(null);
  const [quickAssignOpen, setQuickAssignOpen] = useState(false);
  const [pendingBatch, setPendingBatch] = useState<AllocationBatchChangeValues | null>(null);
  const [batchPreviewEntries, setBatchPreviewEntries] = useState<
    readonly AllocationBatchPreviewEntry[]
  >([]);
  const [multiMonthAssignOpen, setMultiMonthAssignOpen] = useState(false);
  const [copySourceMonth, setCopySourceMonth] = useState(1);
  const [copyTargetMonth, setCopyTargetMonth] = useState(2);
  const loadRequestIdRef = useRef(0);
  const boardRegionRef = useRef<HTMLDivElement | null>(null);
  // A minimum drag distance keeps a plain click on a bench card (which arms
  // it) from being swallowed by dnd-kit's pointer-down activation handling.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const filterDefinitions = useMemo<FilterDefinitions<AllocationStudioFilters>>(
    () => ({
      year: { defaultValue: initialDate.getFullYear(), param: 'year' },
      focus: { defaultValue: 'year', param: 'focus' },
      resourceTypeFilter: { defaultValue: 'all', param: 'type' },
      projectSearch: { defaultValue: '', param: 'q', storage: 'local' },
    }),
    [initialDate],
  );
  const {
    filters,
    favorites,
    updateFilter,
    resetFilters,
    saveFavorite,
    applyFavorite,
    removeFavorite,
  } = usePersistentPageFilters('allocation-studio', filterDefinitions);

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
      year: filters.year,
      month: 1,
      allocatedDays: 1,
      origin: 'manual',
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
        importBatches,
      ] = await Promise.all([
        resourcesRepository.getAll(),
        resourceTypesRepository.getAll(),
        projectsRepository.getAll(),
        allocationsRepository.getAll(),
        demandSnapshotsRepository.getAll(),
        workingDaysRepository.getAll(),
        resourceNonWorkingDaysRepository.getAll(),
        appSettingsRepository.getById('app-settings'),
        importBatchesRepository.getAll(),
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
        importBatches,
      });
      setHistory(createAllocationStudioHistory(allocations));
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Unable to load allocation studio data.',
      );
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (history.past.length === 0) {
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
  }, [history.past.length]);

  const displayPrecision = data.appSettings?.displayPrecision ?? 1;
  const visibleMonths = useMemo(() => getFocusMonths(filters.focus), [filters.focus]);
  const focusMonth = visibleMonths[0] ?? 1;
  const focusMonthLabel = MONTH_LABELS[focusMonth - 1] ?? `Month ${focusMonth}`;

  const boardRowOptions = useMemo(
    () => ({
      projects: data.projects,
      resourceTypes: data.resourceTypes,
      resources: data.resources,
      demandSnapshots: data.demandSnapshots,
      allocations: history.present,
      year: filters.year,
      resourceTypeFilter: filters.resourceTypeFilter,
      projectSearch: filters.projectSearch,
    }),
    [
      data.demandSnapshots,
      data.projects,
      data.resourceTypes,
      data.resources,
      history.present,
      filters.projectSearch,
      filters.resourceTypeFilter,
      filters.year,
    ],
  );
  // Kept for the drag/keyboard handlers below, which need the raw
  // (project, resourceType) -> 12-month gap data, independent of the
  // demand-line/assignment-line split used for rendering.
  const demandRows = useMemo(() => buildAllocationStudioRows(boardRowOptions), [boardRowOptions]);
  const boardBlocks = useMemo(
    () => buildAllocationStudioBoardRows({ ...boardRowOptions, importBatches: data.importBatches }),
    [boardRowOptions, data.importBatches],
  );
  const benchRows = useMemo(
    () =>
      buildResourceBenchRows({
        resources: data.resources,
        resourceTypes: data.resourceTypes,
        year: filters.year,
        month: focusMonth,
        workingDaysCalendars: data.workingDaysCalendars,
        resourceNonWorkingDays: data.resourceNonWorkingDays,
        allocations: history.present,
        appSettings: data.appSettings,
        resourceTypeFilter: filters.resourceTypeFilter,
        searchTerm: '',
      }),
    [
      data.appSettings,
      data.resourceNonWorkingDays,
      data.resourceTypes,
      data.resources,
      data.workingDaysCalendars,
      filters.resourceTypeFilter,
      focusMonth,
      filters.year,
      history.present,
    ],
  );
  const yearOptions = useMemo(() => {
    const years = new Set<number>([filters.year]);

    for (const allocation of data.allocations) {
      years.add(allocation.year);
    }

    for (const snapshot of data.demandSnapshots) {
      years.add(snapshot.year);
    }

    return [...years].sort((left, right) => left - right);
  }, [data.allocations, data.demandSnapshots, filters.year]);

  const filterFields = useMemo<FilterBarField[]>(
    () => [
      {
        type: 'search',
        key: 'projectSearch',
        label: 'Project search',
        value: filters.projectSearch,
        placeholder: 'Search by project code or name',
        onChange: (value) => updateFilter('projectSearch', value),
      },
      {
        type: 'single-select',
        key: 'resourceTypeFilter',
        label: 'Resource type',
        value: filters.resourceTypeFilter,
        options: [
          { value: 'all', label: 'All resource types' },
          ...data.resourceTypes.map((resourceType) => ({
            value: resourceType.id,
            label: getResourceTypeDisplayLabel(resourceType),
          })),
        ],
        onChange: (value) => updateFilter('resourceTypeFilter', value),
      },
      {
        type: 'single-select',
        key: 'focus',
        label: 'Focus',
        value: filters.focus,
        options: [
          { value: 'year', label: 'Year' },
          { value: 's1', label: 'S1' },
          { value: 's2', label: 'S2' },
          { value: 'q1', label: 'Q1' },
          { value: 'q2', label: 'Q2' },
          { value: 'q3', label: 'Q3' },
          { value: 'q4', label: 'Q4' },
        ],
        onChange: (value) => updateFilter('focus', value as CapacityFocus),
      },
      {
        type: 'single-select',
        key: 'year',
        label: 'Year',
        value: String(filters.year),
        options: yearOptions.map((optionYear) => ({
          value: String(optionYear),
          label: String(optionYear),
        })),
        onChange: (value) => updateFilter('year', Number(value)),
      },
    ],
    [
      data.resourceTypes,
      filters.focus,
      filters.projectSearch,
      filters.resourceTypeFilter,
      filters.year,
      updateFilter,
      yearOptions,
    ],
  );

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

  const openQuickAssign = useCallback(
    (values: AllocationChangeValues) => {
      form.reset(values);
      simulateChange(values);
      setQuickAssignOpen(true);
    },
    [form, simulateChange],
  );

  function handleCloseQuickAssign() {
    setQuickAssignOpen(false);
  }

  function handleOpenBlankAssign() {
    openQuickAssign({
      mode: 'add',
      resourceId: '',
      sourceProjectCode: '',
      projectCode: '',
      resourceTypeId: '',
      year: filters.year,
      month: focusMonth,
      allocatedDays: 1,
      origin: 'manual',
    });
  }

  const openMultiMonthAssign = useCallback(
    (batch: AllocationBatchChangeValues) => {
      const simulatedAllocations = applyAllocationChangeBatch(history.present, batch);
      const entries = buildBatchSimulationPreview({
        currentAllocations: history.present,
        simulatedAllocations,
        batch,
        demandSnapshots: data.demandSnapshots,
      });

      setPendingBatch(batch);
      setBatchPreviewEntries(entries);
      setMultiMonthAssignOpen(true);
    },
    [data.demandSnapshots, history.present],
  );

  const openMultiMonthAssignForDrop = useCallback(
    (projectCode: string, resourceTypeId: string, year: number, resourceId: string) => {
      const row = demandRows.find(
        (candidate) =>
          candidate.projectCode === projectCode && candidate.resourceTypeId === resourceTypeId,
      );

      if (!row) {
        return;
      }

      const entries = resolveMultiMonthDropDays(row, visibleMonths);

      openMultiMonthAssign({
        resourceId,
        projectCode,
        resourceTypeId,
        year,
        origin: 'drag-and-drop',
        entries,
      });
    },
    [demandRows, openMultiMonthAssign, visibleMonths],
  );

  function handleCloseMultiMonthAssign() {
    setMultiMonthAssignOpen(false);
    setPendingBatch(null);
    setBatchPreviewEntries([]);
  }

  function handleConfirmMultiMonthAssign() {
    if (!pendingBatch) {
      return;
    }

    const simulatedAllocations = applyAllocationChangeBatch(history.present, pendingBatch);
    setHistory((current) => commitAllocationStudioHistory(current, simulatedAllocations));
    setFeedback(
      `Draft allocations queued for ${pendingBatch.entries.length} month(s). Save draft to persist changes.`,
    );
    setMultiMonthAssignOpen(false);
    setPendingBatch(null);
    setBatchPreviewEntries([]);
    setArmedResourceId(null);
  }

  // Rule A: any interaction that adds a NEW resource to a project (bench
  // drop, or arm + activate) always proposes an allocation across every
  // currently visible month, regardless of which specific cell/row was the
  // physical target — mouse and keyboard must produce identical results.
  function handleCellActivate(projectCode: string, resourceTypeId: string, month: number) {
    if (armedResourceId) {
      openMultiMonthAssignForDrop(projectCode, resourceTypeId, filters.year, armedResourceId);
      return;
    }

    const row = demandRows.find(
      (candidate) =>
        candidate.projectCode === projectCode && candidate.resourceTypeId === resourceTypeId,
    );
    const cell = row?.months[month - 1];

    openQuickAssign({
      mode: 'add',
      resourceId: '',
      sourceProjectCode: '',
      projectCode,
      resourceTypeId,
      year: filters.year,
      month,
      allocatedDays: cell ? resolveDefaultDropDays(cell) : 1,
      origin: 'manual',
    });
  }

  function handleAssignmentCellActivate(
    resourceId: string,
    projectCode: string,
    resourceTypeId: string,
    month: number,
    allocatedDays: number,
  ) {
    openQuickAssign({
      mode: 'set',
      resourceId,
      sourceProjectCode: '',
      projectCode,
      resourceTypeId,
      year: filters.year,
      month,
      allocatedDays,
      origin: 'manual',
    });
  }

  function handleArm(resourceId: string) {
    setArmedResourceId((current) => (current === resourceId ? null : resourceId));
  }

  // Rule A (new resource -> project): always fans out across every visible
  // month, whether the drop landed on a specific month cell, an assignment
  // row's cell, or the demand-line row's non-month columns (drop-row::).
  // Rule B (moving an EXISTING allocation between projects): stays
  // single-month, exactly as before this redesign — a distinct, pre-existing
  // interaction the user did not ask to change. Its keyboard alternative
  // remains the "Add allocation..." form (mode: 'move'), untouched.
  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    const dragData = event.active.data.current;

    if (!overId || !dragData || typeof overId !== 'string') {
      return;
    }

    if (overId.startsWith('drop-row::')) {
      if (dragData.kind !== 'resource') {
        // Row-level targets only support adding a new resource (Rule A) — an
        // existing-allocation drag has no specific month to move into here.
        return;
      }

      const [, projectCode = '', resourceTypeId = '', yearToken = ''] = overId.split('::');
      openMultiMonthAssignForDrop(
        projectCode,
        resourceTypeId,
        Number(yearToken),
        String(dragData.resourceId),
      );
      return;
    }

    if (!overId.startsWith('drop::')) {
      return;
    }

    const [, projectCode = '', resourceTypeId = '', yearToken = '', monthToken = ''] =
      overId.split('::');
    const yearValue = Number(yearToken);
    const monthValue = Number(monthToken);

    if (dragData.kind === 'resource') {
      openMultiMonthAssignForDrop(
        projectCode,
        resourceTypeId,
        yearValue,
        String(dragData.resourceId),
      );
      return;
    }

    if (dragData.kind === 'existing-allocation') {
      // The drag source is now a whole assignment row (not a per-month
      // chip), so the moved amount is resolved from the current draft at the
      // source month rather than carried in the drag payload.
      const sourceAllocation = history.present.find(
        (allocation) =>
          allocation.resourceId === String(dragData.resourceId) &&
          allocation.projectCode === String(dragData.projectCode) &&
          allocation.resourceTypeId === String(dragData.resourceTypeId) &&
          allocation.year === yearValue &&
          allocation.month === monthValue,
      );

      if (!sourceAllocation) {
        return;
      }

      const values: AllocationChangeValues = {
        mode: 'move',
        resourceId: String(dragData.resourceId),
        sourceProjectCode: String(dragData.projectCode),
        projectCode,
        resourceTypeId,
        year: yearValue,
        month: monthValue,
        allocatedDays: sourceAllocation.allocatedDays,
        origin: 'drag-and-drop',
      };
      const { simulatedAllocations } = simulateChange(values);
      setHistory((current) => commitAllocationStudioHistory(current, simulatedAllocations));
      setFeedback('Allocation moved. Save draft to commit changes.');
    }
  }

  async function handleSimulate(values: AllocationChangeValues) {
    simulateChange(values);
    setFeedback('Simulation updated. Review utilization and coverage before saving.');
  }

  async function handleQueue(values: AllocationChangeValues) {
    const { simulatedAllocations } = simulateChange(values);
    setHistory((current) => commitAllocationStudioHistory(current, simulatedAllocations));
    setFeedback('Draft allocation queued. Save draft to persist changes.');
    setQuickAssignOpen(false);
    setArmedResourceId(null);
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
      year: filters.year,
      sourceMonth: copySourceMonth,
      targetMonth: copyTargetMonth,
      resourceTypeId: filters.resourceTypeFilter === 'all' ? undefined : filters.resourceTypeFilter,
    });

    setHistory((current) => commitAllocationStudioHistory(current, next));
    setFeedback('Month copied into the current draft. Save draft to persist changes.');
  }

  const focusGridCell = useCallback((rowIndex: number, monthIndex: number) => {
    const target = boardRegionRef.current?.querySelector<HTMLButtonElement>(
      `[data-grid-cell="true"][data-row-index="${rowIndex}"][data-month-index="${monthIndex}"]`,
    );
    target?.focus();
  }, []);
  const handleGridKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex);
      const monthIndex = Number(event.currentTarget.dataset.monthIndex);

      if (!Number.isInteger(rowIndex) || !Number.isInteger(monthIndex)) {
        return;
      }

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          focusGridCell(rowIndex, Math.min(monthIndex + 1, visibleMonths.length - 1));
          break;
        case 'ArrowLeft':
          event.preventDefault();
          focusGridCell(rowIndex, Math.max(monthIndex - 1, 0));
          break;
        case 'ArrowDown':
          event.preventDefault();
          focusGridCell(rowIndex + 1, monthIndex);
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusGridCell(Math.max(rowIndex - 1, 0), monthIndex);
          break;
        case 'Home':
          event.preventDefault();
          focusGridCell(rowIndex, 0);
          break;
        case 'End':
          event.preventDefault();
          focusGridCell(rowIndex, visibleMonths.length - 1);
          break;
        default:
          break;
      }
    },
    [focusGridCell, visibleMonths.length],
  );

  return (
    <div className="flex w-full flex-col gap-6 p-6" id="allocation-studio-page">
      <PageHeader
        description="Drag a resource onto a project cell to add supply, or arm a resource and activate a cell with the keyboard. Every change is simulated before it joins your draft."
        descriptionClassName="max-w-4xl"
        icon={Shuffle}
        title="Allocation Studio"
      />

      <FeedbackMessage message={feedback} />

      <FilterBar
        favorites={favorites}
        fields={filterFields}
        onApplyFavorite={applyFavorite}
        onDeleteFavorite={removeFavorite}
        onReset={resetFilters}
        onSaveFavorite={saveFavorite}
        resultsSummary={`${boardBlocks.length} project row(s)`}
      />

      <section className="flex flex-wrap items-center gap-2">
        <Button onClick={handleOpenBlankAssign}>Add allocation…</Button>
        <Button
          disabled={history.past.length === 0}
          variant="secondary"
          onClick={() => setHistory((current) => undoAllocationStudioHistory(current))}
        >
          Undo
        </Button>
        <Button
          disabled={history.future.length === 0}
          variant="secondary"
          onClick={() => setHistory((current) => redoAllocationStudioHistory(current))}
        >
          Redo
        </Button>
        <Button
          onClick={() => {
            void handleSaveDraft();
          }}
        >
          Save draft
        </Button>
      </section>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <section className="grid gap-6 xl:grid-cols-[22rem_1fr]">
          <section className="space-y-6">
            <ResourceBenchPanel
              armedResourceId={armedResourceId}
              displayPrecision={displayPrecision}
              focusMonthLabel={focusMonthLabel}
              rows={benchRows}
              onArm={handleArm}
            />

            <Card>
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
              <Button className="mt-4" variant="secondary" onClick={handleCopyMonth}>
                Copy month into draft
              </Button>
            </Card>
          </section>

          <div className="min-w-0">
            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold" id="allocation-board-heading">
                    Allocation board
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Drag a resource card onto a cell, or arm a resource and press Enter or Space on
                    a cell, to open quick-assign.
                  </p>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Draft rows: {boardBlocks.length}
                </p>
              </div>
              {loading ? (
                <p>Loading allocation board…</p>
              ) : boardBlocks.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  No board row matches the selected filters.
                </p>
              ) : (
                <div
                  aria-describedby="allocation-board-instructions"
                  aria-labelledby="allocation-board-heading"
                  ref={boardRegionRef}
                  role="region"
                >
                  <p className="sr-only" id="allocation-board-instructions">
                    Use Tab to enter the board buttons, then arrow keys to move between months and
                    projects. Press Enter or Space to open quick-assign for the focused cell.
                  </p>
                  <TableShell caption="Allocation board by project and month, with keyboard-operable drop targets.">
                    <thead>
                      <tr className="border-b border-[var(--surf-divider)]">
                        <th className="px-3 py-2 font-semibold" scope="col">
                          Project
                        </th>
                        <th className="px-3 py-2 font-semibold" scope="col">
                          Status
                        </th>
                        <th className="px-3 py-2 font-semibold" scope="col">
                          Resource
                        </th>
                        <th className="px-3 py-2 font-semibold" scope="col">
                          Activity
                        </th>
                        <th className="px-3 py-2 text-right font-semibold" scope="col">
                          Total supply
                        </th>
                        <th className="px-3 py-2 text-right font-semibold" scope="col">
                          Total demand
                        </th>
                        {visibleMonths.map((month) => (
                          <th className="px-3 py-2 font-semibold" key={month} scope="col">
                            {new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
                              new Date(filters.year, month - 1, 1),
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let flatRowIndex = 0;

                        return boardBlocks.map((block) => {
                          const demandRowIndex = flatRowIndex;
                          flatRowIndex += 1;
                          const assignmentRowIndexes = block.assignments.map(() => {
                            const index = flatRowIndex;
                            flatRowIndex += 1;
                            return index;
                          });

                          return (
                            <Fragment
                              key={`${block.demandLine.projectCode}-${block.demandLine.resourceTypeId}`}
                            >
                              <DemandLineRow
                                canAddAcrossMonths={Boolean(armedResourceId)}
                                displayPrecision={displayPrecision}
                                row={block.demandLine}
                                rowIndex={demandRowIndex}
                                visibleMonths={visibleMonths}
                                year={filters.year}
                                onActivateCell={(month) =>
                                  handleCellActivate(
                                    block.demandLine.projectCode,
                                    block.demandLine.resourceTypeId,
                                    month,
                                  )
                                }
                                onAddAcrossMonths={() => {
                                  if (!armedResourceId) {
                                    return;
                                  }

                                  openMultiMonthAssignForDrop(
                                    block.demandLine.projectCode,
                                    block.demandLine.resourceTypeId,
                                    filters.year,
                                    armedResourceId,
                                  );
                                }}
                                onGridKeyDown={handleGridKeyDown}
                              />
                              {block.assignments.map((assignment, assignmentIndex) => (
                                <AssignmentLineRow
                                  displayPrecision={displayPrecision}
                                  key={assignment.resourceId}
                                  row={assignment}
                                  rowIndex={assignmentRowIndexes[assignmentIndex] ?? demandRowIndex}
                                  visibleMonths={visibleMonths}
                                  year={filters.year}
                                  onActivateCell={(month) => {
                                    const cell = assignment.months[month - 1];

                                    handleAssignmentCellActivate(
                                      assignment.resourceId,
                                      assignment.projectCode,
                                      assignment.resourceTypeId,
                                      month,
                                      cell?.allocatedDays ?? 0,
                                    );
                                  }}
                                  onGridKeyDown={handleGridKeyDown}
                                />
                              ))}
                            </Fragment>
                          );
                        });
                      })()}
                    </tbody>
                  </TableShell>
                </div>
              )}
            </Card>
          </div>
        </section>

        <QuickAssignDrawer
          displayPrecision={displayPrecision}
          form={form}
          open={quickAssignOpen}
          preview={simulation}
          projects={data.projects}
          resources={data.resources}
          resourceTypes={data.resourceTypes}
          onClose={handleCloseQuickAssign}
          onQueue={(values) => {
            void handleQueue(values);
          }}
          onSimulate={(values) => {
            void handleSimulate(values);
          }}
        />

        <MultiMonthAssignPanel
          displayPrecision={displayPrecision}
          entries={batchPreviewEntries}
          open={multiMonthAssignOpen}
          projectCode={pendingBatch?.projectCode ?? ''}
          projectName={
            data.projects.find((project) => project.code === pendingBatch?.projectCode)?.name ??
            pendingBatch?.projectCode ??
            ''
          }
          resourceName={(() => {
            const resource = data.resources.find(
              (candidate) => candidate.id === pendingBatch?.resourceId,
            );
            return resource ? getResourceFullName(resource) : '';
          })()}
          resourceTypeLabel={(() => {
            const resourceType = data.resourceTypes.find(
              (candidate) => candidate.id === pendingBatch?.resourceTypeId,
            );
            return resourceType ? getResourceTypeDisplayLabel(resourceType) : '';
          })()}
          onClose={handleCloseMultiMonthAssign}
          onConfirm={handleConfirmMultiMonthAssign}
        />
      </DndContext>
    </div>
  );
}
