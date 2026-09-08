import { z } from 'zod';

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
import { getResourceFullName } from '@/domain/entities';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';
import {
  buildDemandAllocationSummary,
  buildResourceMonthSummary,
  findLatestDemandSnapshot,
  selectLatestDemandSnapshots,
} from '@/domain/calculations';
import { MONTH_LABELS } from '@/features/dashboard';

export const allocationChangeSchema = z
  .object({
    mode: z.enum(['add', 'set', 'move']),
    resourceId: z.string().uuid('Resource is required.'),
    sourceProjectCode: z.string().trim().default(''),
    projectCode: z.string().trim().min(1, 'Project is required.'),
    resourceTypeId: z.string().uuid('Resource type is required.'),
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12),
    allocatedDays: z.coerce
      .number()
      .refine(Number.isFinite, 'Allocated days are required.')
      .refine((value) => value >= 0, 'Allocated days cannot be negative.'),
  })
  .superRefine((values, ctx) => {
    if (values.mode === 'move' && values.sourceProjectCode.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceProjectCode'],
        message: 'Source project is required for move operations.',
      });
    }
  });

export type AllocationChangeValues = z.infer<typeof allocationChangeSchema>;

export interface AllocationStudioHistory {
  past: Allocation[][];
  present: Allocation[];
  future: Allocation[][];
}

export interface AllocationStudioCellAllocation {
  id: string;
  resourceId: string;
  resourceName: string;
  allocatedDays: number;
}

export interface AllocationStudioCell {
  month: number;
  label: string;
  demandDays: number;
  allocatedDays: number;
  remainingDemandDays: number;
  overServiceDays: number;
  coverageRatePercent: number;
  allocations: AllocationStudioCellAllocation[];
}

export interface AllocationStudioRow {
  projectCode: string;
  projectName: string;
  resourceTypeId: string;
  resourceTypeLabel: string;
  months: AllocationStudioCell[];
}

export interface AllocationSimulationPreview {
  beforeResourceSummary: ReturnType<typeof buildResourceMonthSummary>;
  afterResourceSummary: ReturnType<typeof buildResourceMonthSummary>;
  beforeDemandSummary: ReturnType<typeof buildDemandAllocationSummary>;
  afterDemandSummary: ReturnType<typeof buildDemandAllocationSummary>;
}

function cloneAllocations(allocations: readonly Allocation[]): Allocation[] {
  return allocations.map((allocation) => ({ ...allocation }));
}

export function createAllocationStudioHistory(
  allocations: readonly Allocation[],
): AllocationStudioHistory {
  return {
    past: [],
    present: cloneAllocations(allocations),
    future: [],
  };
}

export function commitAllocationStudioHistory(
  history: AllocationStudioHistory,
  nextAllocations: readonly Allocation[],
): AllocationStudioHistory {
  return {
    past: [...history.past, cloneAllocations(history.present)],
    present: cloneAllocations(nextAllocations),
    future: [],
  };
}

export function undoAllocationStudioHistory(
  history: AllocationStudioHistory,
): AllocationStudioHistory {
  const previous = history.past.at(-1);

  if (!previous) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: cloneAllocations(previous),
    future: [cloneAllocations(history.present), ...history.future],
  };
}

export function redoAllocationStudioHistory(
  history: AllocationStudioHistory,
): AllocationStudioHistory {
  const [next, ...rest] = history.future;

  if (!next) {
    return history;
  }

  return {
    past: [...history.past, cloneAllocations(history.present)],
    present: cloneAllocations(next),
    future: rest,
  };
}

function createAllocationRecord(values: {
  resourceId: string;
  projectCode: string;
  resourceTypeId: string;
  year: number;
  month: number;
  allocatedDays: number;
  origin: Allocation['origin'];
}): Allocation {
  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    resourceId: values.resourceId,
    projectCode: values.projectCode.toUpperCase(),
    resourceTypeId: values.resourceTypeId,
    year: values.year,
    month: values.month,
    allocatedDays: normalizeAmount(values.allocatedDays),
    origin: values.origin,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function findAllocationIndex(
  allocations: readonly Allocation[],
  key: Pick<Allocation, 'resourceId' | 'projectCode' | 'resourceTypeId' | 'year' | 'month'>,
): number {
  return allocations.findIndex(
    (allocation) =>
      allocation.resourceId === key.resourceId &&
      allocation.projectCode === key.projectCode &&
      allocation.resourceTypeId === key.resourceTypeId &&
      allocation.year === key.year &&
      allocation.month === key.month,
  );
}

export function applyAllocationChange(
  allocations: readonly Allocation[],
  change: AllocationChangeValues,
): Allocation[] {
  const next = cloneAllocations(allocations);
  const normalizedProjectCode = change.projectCode.toUpperCase();
  const targetIndex = findAllocationIndex(next, {
    resourceId: change.resourceId,
    projectCode: normalizedProjectCode,
    resourceTypeId: change.resourceTypeId,
    year: change.year,
    month: change.month,
  });
  const now = new Date().toISOString();

  if (change.mode === 'move') {
    const normalizedSourceCode = change.sourceProjectCode.toUpperCase();
    const sourceIndex = findAllocationIndex(next, {
      resourceId: change.resourceId,
      projectCode: normalizedSourceCode,
      resourceTypeId: change.resourceTypeId,
      year: change.year,
      month: change.month,
    });
    const source = sourceIndex >= 0 ? next[sourceIndex] : null;

    if (!source) {
      return next;
    }

    const movedDays = Math.min(source.allocatedDays, change.allocatedDays);
    const sourceRemainingDays = normalizeAmount(source.allocatedDays - movedDays);

    if (sourceRemainingDays === 0) {
      next.splice(sourceIndex, 1);
    } else {
      next[sourceIndex] = {
        ...source,
        allocatedDays: sourceRemainingDays,
        updatedAt: now,
      };
    }

    const refreshedTargetIndex = findAllocationIndex(next, {
      resourceId: change.resourceId,
      projectCode: normalizedProjectCode,
      resourceTypeId: change.resourceTypeId,
      year: change.year,
      month: change.month,
    });

    if (refreshedTargetIndex >= 0) {
      const target = next[refreshedTargetIndex];

      if (!target) {
        return next;
      }

      next[refreshedTargetIndex] = {
        ...target,
        allocatedDays: normalizeAmount(target.allocatedDays + movedDays),
        updatedAt: now,
      };
    } else {
      next.push(
        createAllocationRecord({
          resourceId: change.resourceId,
          projectCode: normalizedProjectCode,
          resourceTypeId: change.resourceTypeId,
          year: change.year,
          month: change.month,
          allocatedDays: movedDays,
          origin: 'drag-and-drop',
        }),
      );
    }

    return next;
  }

  if (targetIndex >= 0) {
    const current = next[targetIndex];

    if (!current) {
      return next;
    }

    const nextDays =
      change.mode === 'add'
        ? normalizeAmount(current.allocatedDays + change.allocatedDays)
        : normalizeAmount(change.allocatedDays);

    if (nextDays === 0) {
      next.splice(targetIndex, 1);
      return next;
    }

    next[targetIndex] = {
      ...current,
      allocatedDays: nextDays,
      origin: 'drag-and-drop',
      updatedAt: now,
    };

    return next;
  }

  if (change.allocatedDays === 0) {
    return next;
  }

  next.push(
    createAllocationRecord({
      resourceId: change.resourceId,
      projectCode: normalizedProjectCode,
      resourceTypeId: change.resourceTypeId,
      year: change.year,
      month: change.month,
      allocatedDays: change.allocatedDays,
      origin: 'drag-and-drop',
    }),
  );

  return next;
}

export function copyMonthAllocations(options: {
  allocations: readonly Allocation[];
  year: number;
  sourceMonth: number;
  targetMonth: number;
  resourceTypeId?: string;
}): Allocation[] {
  const sourceItems = options.allocations.filter(
    (allocation) =>
      allocation.year === options.year &&
      allocation.month === options.sourceMonth &&
      (!options.resourceTypeId || allocation.resourceTypeId === options.resourceTypeId),
  );
  const retainedItems = options.allocations.filter(
    (allocation) =>
      allocation.year !== options.year ||
      allocation.month !== options.targetMonth ||
      (options.resourceTypeId !== undefined &&
        allocation.resourceTypeId !== options.resourceTypeId),
  );
  const now = new Date().toISOString();

  const copiedItems = sourceItems.map((allocation) => {
    const existingTarget = options.allocations.find(
      (candidate) =>
        candidate.resourceId === allocation.resourceId &&
        candidate.projectCode === allocation.projectCode &&
        candidate.resourceTypeId === allocation.resourceTypeId &&
        candidate.year === options.year &&
        candidate.month === options.targetMonth,
    );

    return existingTarget
      ? {
          ...existingTarget,
          allocatedDays: allocation.allocatedDays,
          origin: 'drag-and-drop' as const,
          updatedAt: now,
        }
      : {
          ...allocation,
          id: crypto.randomUUID(),
          month: options.targetMonth,
          origin: 'drag-and-drop' as const,
          createdAt: now,
          updatedAt: now,
        };
  });

  return [...retainedItems, ...copiedItems];
}

export function buildAllocationStudioRows(options: {
  projects: readonly Project[];
  resourceTypes: readonly ResourceType[];
  resources: readonly Resource[];
  demandSnapshots: readonly DemandSnapshot[];
  allocations: readonly Allocation[];
  year: number;
  resourceTypeFilter: string;
  projectSearch: string;
}): AllocationStudioRow[] {
  const projectLookup = new Map(options.projects.map((project) => [project.code, project.name]));
  const resourceTypeLookup = new Map(
    options.resourceTypes.map((resourceType) => [resourceType.id, resourceType.label]),
  );
  const resourceLookup = new Map(
    options.resources.map((resource) => [resource.id, getResourceFullName(resource)]),
  );
  const normalizedSearch = options.projectSearch.trim().toUpperCase();
  const latestSnapshots = selectLatestDemandSnapshots(options.demandSnapshots).filter(
    (snapshot) =>
      snapshot.year === options.year &&
      (options.resourceTypeFilter === 'all' ||
        snapshot.resourceTypeId === options.resourceTypeFilter),
  );
  const keys = new Set<string>();

  for (const snapshot of latestSnapshots) {
    keys.add(`${snapshot.projectCode}::${snapshot.resourceTypeId}`);
  }

  for (const allocation of options.allocations) {
    if (
      allocation.year === options.year &&
      (options.resourceTypeFilter === 'all' ||
        allocation.resourceTypeId === options.resourceTypeFilter)
    ) {
      keys.add(`${allocation.projectCode}::${allocation.resourceTypeId}`);
    }
  }

  return [...keys]
    .map((key) => {
      const [projectCode = '', resourceTypeId = ''] = key.split('::');
      const projectName = projectLookup.get(projectCode) ?? projectCode;
      const resourceTypeLabel = resourceTypeLookup.get(resourceTypeId) ?? resourceTypeId;
      const months = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const snapshot = findLatestDemandSnapshot(options.demandSnapshots, {
          projectCode,
          resourceTypeId,
          year: options.year,
          month,
        });
        const demandDays = snapshot?.demandDays ?? 0;
        const summary = buildDemandAllocationSummary({
          demandSnapshot: {
            projectCode,
            resourceTypeId,
            year: options.year,
            month,
            demandDays,
          },
          allocations: options.allocations,
        });

        return {
          month,
          label: MONTH_LABELS[index] ?? `Month ${month}`,
          demandDays: summary.demandDays,
          allocatedDays: summary.allocatedDays,
          remainingDemandDays: summary.remainingDemandDays,
          overServiceDays: summary.overServiceDays,
          coverageRatePercent: summary.coverageRatePercent,
          allocations: options.allocations
            .filter(
              (allocation) =>
                allocation.projectCode === projectCode &&
                allocation.resourceTypeId === resourceTypeId &&
                allocation.year === options.year &&
                allocation.month === month,
            )
            .map((allocation) => ({
              id: allocation.id,
              resourceId: allocation.resourceId,
              resourceName: resourceLookup.get(allocation.resourceId) ?? allocation.resourceId,
              allocatedDays: allocation.allocatedDays,
            })),
        } satisfies AllocationStudioCell;
      });

      return {
        projectCode,
        projectName,
        resourceTypeId,
        resourceTypeLabel,
        months,
      } satisfies AllocationStudioRow;
    })
    .filter(
      (row) =>
        normalizedSearch.length === 0 ||
        row.projectCode.includes(normalizedSearch) ||
        row.projectName.toUpperCase().includes(normalizedSearch),
    )
    .sort(
      (left, right) =>
        left.projectCode.localeCompare(right.projectCode, undefined, {
          sensitivity: 'base',
        }) ||
        left.resourceTypeLabel.localeCompare(right.resourceTypeLabel, undefined, {
          sensitivity: 'base',
        }),
    );
}

export function buildSimulationPreview(options: {
  currentAllocations: readonly Allocation[];
  simulatedAllocations: readonly Allocation[];
  change: AllocationChangeValues;
  resources: readonly Resource[];
  workingDaysCalendars: readonly WorkingDaysCalendar[];
  resourceNonWorkingDays: readonly ResourceNonWorkingDays[];
  appSettings?: AppSettings | null;
  demandSnapshots: readonly DemandSnapshot[];
}): AllocationSimulationPreview | null {
  const resource = options.resources.find(
    (candidate) => candidate.id === options.change.resourceId,
  );

  if (!resource) {
    return null;
  }

  const beforeResourceSummary = buildResourceMonthSummary({
    resource,
    year: options.change.year,
    month: options.change.month,
    workingDaysCalendars: options.workingDaysCalendars,
    resourceNonWorkingDays: options.resourceNonWorkingDays,
    allocations: options.currentAllocations,
    appSettings: options.appSettings,
  });
  const afterResourceSummary = buildResourceMonthSummary({
    resource,
    year: options.change.year,
    month: options.change.month,
    workingDaysCalendars: options.workingDaysCalendars,
    resourceNonWorkingDays: options.resourceNonWorkingDays,
    allocations: options.simulatedAllocations,
    appSettings: options.appSettings,
  });
  const snapshot = findLatestDemandSnapshot(options.demandSnapshots, {
    projectCode: options.change.projectCode.toUpperCase(),
    resourceTypeId: options.change.resourceTypeId,
    year: options.change.year,
    month: options.change.month,
  });
  const demandDays = snapshot?.demandDays ?? 0;

  return {
    beforeResourceSummary,
    afterResourceSummary,
    beforeDemandSummary: buildDemandAllocationSummary({
      demandSnapshot: {
        projectCode: options.change.projectCode.toUpperCase(),
        resourceTypeId: options.change.resourceTypeId,
        year: options.change.year,
        month: options.change.month,
        demandDays,
      },
      allocations: options.currentAllocations,
    }),
    afterDemandSummary: buildDemandAllocationSummary({
      demandSnapshot: {
        projectCode: options.change.projectCode.toUpperCase(),
        resourceTypeId: options.change.resourceTypeId,
        year: options.change.year,
        month: options.change.month,
        demandDays,
      },
      allocations: options.simulatedAllocations,
    }),
  };
}
