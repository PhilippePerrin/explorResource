import { z } from 'zod';

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
import { getResourceFullName } from '@/domain/entities';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';
import {
  buildDemandAllocationSummary,
  buildResourceMonthSummary,
  findLatestDemandSnapshot,
  selectLatestDemandSnapshots,
  type DemandAllocationSummary,
  type ResourceMonthSummary,
} from '@/domain/calculations';
import { formatDayAmount } from '@/components/formatDayAmount';
import { MONTH_LABELS } from '@/features/dashboard';
import { getResourceTypeDisplayLabel } from '@/features/resource-types';

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
    origin: z.enum(['manual', 'drag-and-drop']),
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
  supplyDays: number;
  importBatchId: string | null;
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
  resourceTypeFullLabel: string;
  months: AllocationStudioCell[];
}

/**
 * 'mixed' surfaces the (legitimate) case where a demand-line row's 12 months
 * are backed by different import batches — findLatestDemandSnapshot resolves
 * the latest snapshot independently per month, so a row can span batches.
 */
export type AllocationStudioRowStatus =
  'validated' | 'draft' | 'cancelled' | 'manual' | 'none' | 'mixed';

export interface AllocationStudioDemandLineRow {
  kind: 'demand-line';
  projectCode: string;
  projectName: string;
  resourceTypeId: string;
  resourceTypeLabel: string;
  resourceTypeFullLabel: string;
  status: AllocationStudioRowStatus;
  totalSupplyDays: number;
  totalDemandDays: number;
  months: AllocationStudioCell[];
}

export interface AllocationStudioAssignmentMonth {
  month: number;
  label: string;
  allocatedDays: number;
}

export interface AllocationStudioAssignmentRow {
  kind: 'assignment';
  projectCode: string;
  projectName: string;
  resourceTypeId: string;
  resourceTypeLabel: string;
  resourceId: string;
  resourceName: string;
  // Assignment rows aren't backed by a DemandSnapshot, so there is no batch
  // to report — always 'none', rendered as "—".
  status: Extract<AllocationStudioRowStatus, 'none'>;
  // Mirrors the parent demand-line row's totals: these are project/type-level
  // facts, not per-resource facts, so there is no separate figure to compute.
  totalSupplyDays: number;
  totalDemandDays: number;
  months: AllocationStudioAssignmentMonth[];
}

export type AllocationStudioBoardRow =
  AllocationStudioDemandLineRow | AllocationStudioAssignmentRow;

export interface AllocationStudioProjectBlock {
  demandLine: AllocationStudioDemandLineRow;
  assignments: AllocationStudioAssignmentRow[];
}

export interface AllocationSimulationPreview {
  beforeResourceSummary: ReturnType<typeof buildResourceMonthSummary>;
  afterResourceSummary: ReturnType<typeof buildResourceMonthSummary>;
  beforeDemandSummary: ReturnType<typeof buildDemandAllocationSummary>;
  afterDemandSummary: ReturnType<typeof buildDemandAllocationSummary>;
}

export function buildCoverageBarCaption(
  summary: Pick<
    DemandAllocationSummary,
    'demandDays' | 'allocatedDays' | 'remainingDemandDays' | 'overServiceDays'
  >,
  displayPrecision = 1,
): string {
  const parts = [
    `Demand ${formatDayAmount(summary.demandDays, displayPrecision)} d`,
    `Covered ${formatDayAmount(summary.allocatedDays, displayPrecision)} d`,
    `Gap ${formatDayAmount(summary.remainingDemandDays, displayPrecision)} d`,
  ];

  if (summary.overServiceDays > 0) {
    parts.push(`Over-service ${formatDayAmount(summary.overServiceDays, displayPrecision)} d`);
  }

  return parts.join(' · ');
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
          origin: change.origin,
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
      origin: change.origin,
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
      origin: change.origin,
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
    options.resourceTypes.map((resourceType) => [resourceType.id, resourceType]),
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
      const resourceType = resourceTypeLookup.get(resourceTypeId);
      const resourceTypeLabel = resourceType
        ? getResourceTypeDisplayLabel(resourceType)
        : resourceTypeId;
      const resourceTypeFullLabel = resourceType ? resourceType.label : resourceTypeId;
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
          supplyDays: snapshot?.supplyDays ?? 0,
          importBatchId: snapshot?.importBatchId ?? null,
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
        resourceTypeFullLabel,
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

export function resolveAllocationStudioRowStatus(
  months: readonly Pick<AllocationStudioCell, 'importBatchId'>[],
  importBatches: readonly ImportBatch[],
): AllocationStudioRowStatus {
  const importBatchLookup = new Map(importBatches.map((batch) => [batch.id, batch.status]));
  const statuses = new Set<AllocationStudioRowStatus>();

  for (const month of months) {
    if (!month.importBatchId) {
      continue;
    }

    if (month.importBatchId === 'manual') {
      statuses.add('manual');
      continue;
    }

    const status = importBatchLookup.get(month.importBatchId);

    if (status) {
      statuses.add(status);
    }
  }

  if (statuses.size === 0) {
    return 'none';
  }

  if (statuses.size > 1) {
    return 'mixed';
  }

  return [...statuses][0] ?? 'none';
}

/**
 * Builds the Planisware-style board: one demand-line row per (project,
 * resourceType) — same data as buildAllocationStudioRows, which this wraps
 * unchanged — plus one assignment row per resource with at least one
 * non-zero month anywhere in the year (not just the currently visible
 * months, so rows don't appear/disappear as the user changes the Focus
 * filter). Assignment rows always report Status "none" (they aren't backed
 * by a DemandSnapshot) and mirror the parent's Total supply/demand, since
 * those are project/type-level facts rather than per-resource facts.
 */
export function buildAllocationStudioBoardRows(options: {
  projects: readonly Project[];
  resourceTypes: readonly ResourceType[];
  resources: readonly Resource[];
  demandSnapshots: readonly DemandSnapshot[];
  importBatches: readonly ImportBatch[];
  allocations: readonly Allocation[];
  year: number;
  resourceTypeFilter: string;
  projectSearch: string;
}): AllocationStudioProjectBlock[] {
  const rows = buildAllocationStudioRows(options);
  const resourceLookup = new Map(
    options.resources.map((resource) => [resource.id, getResourceFullName(resource)]),
  );

  return rows.map((row) => {
    const totalSupplyDays = normalizeAmount(
      row.months.reduce((sum, month) => sum + month.supplyDays, 0),
    );
    const totalDemandDays = normalizeAmount(
      row.months.reduce((sum, month) => sum + month.demandDays, 0),
    );
    const status = resolveAllocationStudioRowStatus(row.months, options.importBatches);

    const resourceIds = new Set<string>();

    for (const month of row.months) {
      for (const allocation of month.allocations) {
        if (allocation.allocatedDays !== 0) {
          resourceIds.add(allocation.resourceId);
        }
      }
    }

    const assignments: AllocationStudioAssignmentRow[] = [...resourceIds]
      .map((resourceId) => ({
        kind: 'assignment' as const,
        projectCode: row.projectCode,
        projectName: row.projectName,
        resourceTypeId: row.resourceTypeId,
        resourceTypeLabel: row.resourceTypeLabel,
        resourceId,
        resourceName: resourceLookup.get(resourceId) ?? resourceId,
        status: 'none' as const,
        totalSupplyDays,
        totalDemandDays,
        months: row.months.map((month) => ({
          month: month.month,
          label: month.label,
          allocatedDays:
            month.allocations.find((allocation) => allocation.resourceId === resourceId)
              ?.allocatedDays ?? 0,
        })),
      }))
      .sort((left, right) =>
        left.resourceName.localeCompare(right.resourceName, undefined, {
          sensitivity: 'base',
        }),
      );

    const demandLine: AllocationStudioDemandLineRow = {
      kind: 'demand-line',
      projectCode: row.projectCode,
      projectName: row.projectName,
      resourceTypeId: row.resourceTypeId,
      resourceTypeLabel: row.resourceTypeLabel,
      resourceTypeFullLabel: row.resourceTypeFullLabel,
      status,
      totalSupplyDays,
      totalDemandDays,
      months: row.months,
    };

    return { demandLine, assignments };
  });
}

export interface ResourceBenchRow {
  resource: Resource;
  resourceTypeLabel: string;
  resourceTypeFullLabel: string;
  summary: ResourceMonthSummary;
}

export function buildResourceBenchRows(options: {
  resources: readonly Resource[];
  resourceTypes: readonly ResourceType[];
  year: number;
  month: number;
  workingDaysCalendars: readonly WorkingDaysCalendar[];
  resourceNonWorkingDays: readonly ResourceNonWorkingDays[];
  allocations: readonly Allocation[];
  appSettings?: AppSettings | null;
  resourceTypeFilter: string;
  searchTerm: string;
}): ResourceBenchRow[] {
  const resourceTypeLookup = new Map(
    options.resourceTypes.map((resourceType) => [resourceType.id, resourceType]),
  );
  const normalizedSearch = options.searchTerm.trim().toUpperCase();

  return options.resources
    .filter((resource) => {
      if (resource.status !== 'active') {
        return false;
      }

      if (
        options.resourceTypeFilter !== 'all' &&
        resource.resourceTypeId !== options.resourceTypeFilter
      ) {
        return false;
      }

      return (
        normalizedSearch.length === 0 ||
        getResourceFullName(resource).toUpperCase().includes(normalizedSearch)
      );
    })
    .map((resource) => {
      const resourceType = resourceTypeLookup.get(resource.resourceTypeId);

      return {
        resource,
        resourceTypeLabel: resourceType
          ? getResourceTypeDisplayLabel(resourceType)
          : resource.resourceTypeId,
        resourceTypeFullLabel: resourceType ? resourceType.label : resource.resourceTypeId,
        summary: buildResourceMonthSummary({
          resource,
          year: options.year,
          month: options.month,
          workingDaysCalendars: options.workingDaysCalendars,
          resourceNonWorkingDays: options.resourceNonWorkingDays,
          allocations: options.allocations,
          appSettings: options.appSettings,
        }),
      };
    })
    .sort(
      (left, right) => right.summary.availableCapacityDays - left.summary.availableCapacityDays,
    );
}

/**
 * Default "Days" value proposed when a resource is dropped/armed onto a
 * board cell: fills the remaining gap so a single drop tends to close the
 * demand exactly, but never proposes 0 (applyAllocationChange treats a
 * resulting 0 as a deletion, so a drop must never silently no-op).
 */
export function resolveDefaultDropDays(
  cell: Pick<AllocationStudioCell, 'remainingDemandDays'>,
): number {
  return cell.remainingDemandDays > 0 ? cell.remainingDemandDays : 1;
}

/**
 * Fans resolveDefaultDropDays out across every given month — no new gap
 * logic, just the already-tested single-month function called once per
 * month, so a multi-month drop matches today's single-cell drop semantics
 * exactly for each month it touches.
 */
export function resolveMultiMonthDropDays(
  row: Pick<AllocationStudioRow, 'months'>,
  months: readonly number[],
): { month: number; allocatedDays: number }[] {
  return months.map((month) => {
    const cell = row.months[month - 1];

    return { month, allocatedDays: cell ? resolveDefaultDropDays(cell) : 1 };
  });
}

export const allocationBatchEntrySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  allocatedDays: z.coerce
    .number()
    .refine(Number.isFinite, 'Allocated days are required.')
    .refine((value) => value >= 0, 'Allocated days cannot be negative.'),
});

export const allocationBatchChangeSchema = z.object({
  resourceId: z.string().uuid('Resource is required.'),
  projectCode: z.string().trim().min(1, 'Project is required.'),
  resourceTypeId: z.string().uuid('Resource type is required.'),
  year: z.coerce.number().int(),
  origin: z.enum(['manual', 'drag-and-drop']),
  entries: z.array(allocationBatchEntrySchema).min(1, 'At least one month is required.'),
});

export type AllocationBatchChangeValues = z.infer<typeof allocationBatchChangeSchema>;

/**
 * Folds each month entry through the existing applyAllocationChange
 * (mode: 'add') and returns the final simulated array. The caller commits
 * this array ONCE via the existing commitAllocationStudioHistory, so "one
 * undo step for N months" falls out of the existing whole-array-clone
 * history model — no changes needed there.
 */
export function applyAllocationChangeBatch(
  allocations: readonly Allocation[],
  batch: AllocationBatchChangeValues,
): Allocation[] {
  return batch.entries.reduce<Allocation[]>(
    (current, entry) =>
      applyAllocationChange(current, {
        mode: 'add',
        resourceId: batch.resourceId,
        sourceProjectCode: '',
        projectCode: batch.projectCode,
        resourceTypeId: batch.resourceTypeId,
        year: batch.year,
        month: entry.month,
        allocatedDays: entry.allocatedDays,
        origin: batch.origin,
      }),
    [...allocations],
  );
}

export interface AllocationBatchPreviewEntry {
  month: number;
  label: string;
  proposedAllocatedDays: number;
  beforeDemandSummary: DemandAllocationSummary;
  afterDemandSummary: DemandAllocationSummary;
}

/**
 * Per-month demand coverage before/after, reusing planningAggregations
 * verbatim. Intentionally does not also compute a per-month resource
 * utilization summary (unlike buildSimulationPreview): this panel is a
 * review-then-confirm step over up to 12 months, and utilization detail for
 * that many months would bury the actually decision-relevant number
 * (coverage) in noise. Resource-level utilization stays in Capacity Command
 * Center.
 */
export function buildBatchSimulationPreview(options: {
  currentAllocations: readonly Allocation[];
  simulatedAllocations: readonly Allocation[];
  batch: AllocationBatchChangeValues;
  demandSnapshots: readonly DemandSnapshot[];
}): AllocationBatchPreviewEntry[] {
  const normalizedProjectCode = options.batch.projectCode.toUpperCase();

  return options.batch.entries.map((entry) => {
    const snapshot = findLatestDemandSnapshot(options.demandSnapshots, {
      projectCode: normalizedProjectCode,
      resourceTypeId: options.batch.resourceTypeId,
      year: options.batch.year,
      month: entry.month,
    });
    const demandDays = snapshot?.demandDays ?? 0;
    const demandKey = {
      projectCode: normalizedProjectCode,
      resourceTypeId: options.batch.resourceTypeId,
      year: options.batch.year,
      month: entry.month,
      demandDays,
    };

    return {
      month: entry.month,
      label: MONTH_LABELS[entry.month - 1] ?? `Month ${entry.month}`,
      proposedAllocatedDays: entry.allocatedDays,
      beforeDemandSummary: buildDemandAllocationSummary({
        demandSnapshot: demandKey,
        allocations: options.currentAllocations,
      }),
      afterDemandSummary: buildDemandAllocationSummary({
        demandSnapshot: demandKey,
        allocations: options.simulatedAllocations,
      }),
    };
  });
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
