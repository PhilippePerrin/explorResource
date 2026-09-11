import type {
  Allocation,
  AppSettings,
  DemandSnapshot,
  Resource,
  ResourceNonWorkingDays,
  WorkingDaysCalendar,
} from '@/domain/entities';
import { DEFAULT_VISUAL_THRESHOLDS } from '@/domain/entities';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';

import {
  capaciteBrute,
  capaciteDisponible,
  capaciteNette,
  chargeAffectee,
  chargeNonAffecteeProjet,
} from './capacity';
import { tauxUtilisation, type UtilizationResult } from './utilization';

export interface ResourceMonthSummary {
  year: number;
  month: number;
  workingDaysConfigured: boolean;
  grossCapacityDays: number;
  nonWorkingDays: number;
  netCapacityDays: number;
  assignedLoadDays: number;
  availableCapacityDays: number;
  utilization: UtilizationResult;
}

export interface DemandAllocationSummary {
  demandDays: number;
  allocatedDays: number;
  remainingDemandDays: number;
  overServiceDays: number;
  coverageRatePercent: number;
  allocatedResourceCount: number;
}

export type DemandCoverageState = 'covered' | 'uncovered' | 'over-served' | 'mixed';

export function buildDemandSnapshotKey(
  snapshot: Pick<DemandSnapshot, 'projectCode' | 'resourceTypeId' | 'year' | 'month'>,
): string {
  return `${snapshot.projectCode}::${snapshot.resourceTypeId}::${snapshot.year}::${snapshot.month}`;
}

export function compareDemandSnapshotRecency(
  left: Pick<DemandSnapshot, 'updatedAt' | 'createdAt'>,
  right: Pick<DemandSnapshot, 'updatedAt' | 'createdAt'>,
): number {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }

  return right.createdAt.localeCompare(left.createdAt);
}

export function selectLatestDemandSnapshots(
  demandSnapshots: readonly DemandSnapshot[],
): DemandSnapshot[] {
  const latestByKey = new Map<string, DemandSnapshot>();

  for (const snapshot of demandSnapshots) {
    const key = buildDemandSnapshotKey(snapshot);
    const currentLatest = latestByKey.get(key);

    if (!currentLatest || compareDemandSnapshotRecency(snapshot, currentLatest) < 0) {
      latestByKey.set(key, snapshot);
    }
  }

  return [...latestByKey.values()].sort((left, right) =>
    buildDemandSnapshotKey(left).localeCompare(buildDemandSnapshotKey(right)),
  );
}

export function findLatestDemandSnapshot(
  demandSnapshots: readonly DemandSnapshot[],
  demandKey: Pick<DemandSnapshot, 'projectCode' | 'resourceTypeId' | 'year' | 'month'>,
): DemandSnapshot | undefined {
  return selectLatestDemandSnapshots(demandSnapshots).find(
    (snapshot) => buildDemandSnapshotKey(snapshot) === buildDemandSnapshotKey(demandKey),
  );
}

export function buildResourceMonthSummary(options: {
  resource: Resource;
  year: number;
  month: number;
  workingDaysCalendars: readonly WorkingDaysCalendar[];
  resourceNonWorkingDays: readonly ResourceNonWorkingDays[];
  allocations: readonly Allocation[];
  appSettings?: AppSettings | null;
}): ResourceMonthSummary {
  const {
    resource,
    year,
    month,
    workingDaysCalendars,
    resourceNonWorkingDays,
    allocations,
    appSettings,
  } = options;
  const workingDaysEntry = workingDaysCalendars.find(
    (entry) => entry.year === year && entry.month === month,
  );
  const nonWorkingDaysEntry = resourceNonWorkingDays.find(
    (entry) => entry.resourceId === resource.id && entry.year === year && entry.month === month,
  );
  const grossCapacityDays = workingDaysEntry ? capaciteBrute(workingDaysEntry) : 0;
  const nonWorkingDays = nonWorkingDaysEntry?.days ?? 0;
  const netCapacityDays = capaciteNette(grossCapacityDays, nonWorkingDays);
  const assignedLoadDays = chargeAffectee(allocations, resource.id, year, month);
  const availableCapacityDays = capaciteDisponible(netCapacityDays, assignedLoadDays);
  const utilization = tauxUtilisation(
    assignedLoadDays,
    netCapacityDays,
    appSettings?.visualThresholds ?? DEFAULT_VISUAL_THRESHOLDS,
  );

  return {
    year,
    month,
    workingDaysConfigured: Boolean(workingDaysEntry),
    grossCapacityDays,
    nonWorkingDays,
    netCapacityDays,
    assignedLoadDays,
    availableCapacityDays,
    utilization,
  };
}

export interface ResourcePeriodSummary {
  months: readonly number[];
  workingDaysConfigured: boolean;
  grossCapacityDays: number;
  nonWorkingDays: number;
  netCapacityDays: number;
  assignedLoadDays: number;
  availableCapacityDays: number;
  utilization: UtilizationResult;
}

/**
 * Aggregates a resource's capacity/load over an arbitrary set of months
 * (e.g. a Focus filter's S1/Q2/custom range) by summing the per-month
 * summaries and re-deriving availableCapacityDays/utilization from the
 * totals, rather than summing those two fields independently.
 */
export function buildResourcePeriodSummary(options: {
  resource: Resource;
  year: number;
  months: readonly number[];
  workingDaysCalendars: readonly WorkingDaysCalendar[];
  resourceNonWorkingDays: readonly ResourceNonWorkingDays[];
  allocations: readonly Allocation[];
  appSettings?: AppSettings | null;
}): ResourcePeriodSummary {
  const { months, appSettings } = options;
  const monthSummaries = months.map((month) => buildResourceMonthSummary({ ...options, month }));

  const grossCapacityDays = normalizeAmount(
    monthSummaries.reduce((total, summary) => total + summary.grossCapacityDays, 0),
  );
  const nonWorkingDays = normalizeAmount(
    monthSummaries.reduce((total, summary) => total + summary.nonWorkingDays, 0),
  );
  const netCapacityDays = normalizeAmount(
    monthSummaries.reduce((total, summary) => total + summary.netCapacityDays, 0),
  );
  const assignedLoadDays = normalizeAmount(
    monthSummaries.reduce((total, summary) => total + summary.assignedLoadDays, 0),
  );
  const availableCapacityDays = capaciteDisponible(netCapacityDays, assignedLoadDays);
  const utilization = tauxUtilisation(
    assignedLoadDays,
    netCapacityDays,
    appSettings?.visualThresholds ?? DEFAULT_VISUAL_THRESHOLDS,
  );

  return {
    months,
    workingDaysConfigured: monthSummaries.some((summary) => summary.workingDaysConfigured),
    grossCapacityDays,
    nonWorkingDays,
    netCapacityDays,
    assignedLoadDays,
    availableCapacityDays,
    utilization,
  };
}

export function buildResourceYearSummaries(options: {
  resource: Resource;
  year: number;
  workingDaysCalendars: readonly WorkingDaysCalendar[];
  resourceNonWorkingDays: readonly ResourceNonWorkingDays[];
  allocations: readonly Allocation[];
  appSettings?: AppSettings | null;
}): ResourceMonthSummary[] {
  return Array.from({ length: 12 }, (_, index) =>
    buildResourceMonthSummary({
      ...options,
      month: index + 1,
    }),
  );
}

export function sumAllocatedDaysForDemand(
  allocations: readonly Allocation[],
  demandKey: Pick<DemandSnapshot, 'projectCode' | 'resourceTypeId' | 'year' | 'month'>,
): number {
  return normalizeAmount(
    allocations.reduce((total, allocation) => {
      if (
        allocation.projectCode !== demandKey.projectCode ||
        allocation.resourceTypeId !== demandKey.resourceTypeId ||
        allocation.year !== demandKey.year ||
        allocation.month !== demandKey.month
      ) {
        return total;
      }

      return total + allocation.allocatedDays;
    }, 0),
  );
}

export function buildDemandAllocationSummary(options: {
  demandSnapshot: Pick<
    DemandSnapshot,
    'projectCode' | 'resourceTypeId' | 'year' | 'month' | 'demandDays'
  >;
  allocations: readonly Allocation[];
}): DemandAllocationSummary {
  const { demandSnapshot, allocations } = options;
  const matchingAllocations = allocations.filter(
    (allocation) =>
      allocation.projectCode === demandSnapshot.projectCode &&
      allocation.resourceTypeId === demandSnapshot.resourceTypeId &&
      allocation.year === demandSnapshot.year &&
      allocation.month === demandSnapshot.month,
  );
  const allocatedDays = sumAllocatedDaysForDemand(allocations, demandSnapshot);
  const remainingDemandDays = chargeNonAffecteeProjet(demandSnapshot.demandDays, allocatedDays);
  const overServiceDays = Math.max(0, normalizeAmount(allocatedDays - demandSnapshot.demandDays));
  const allocatedResourceCount = new Set(
    matchingAllocations.map((allocation) => allocation.resourceId),
  ).size;

  return {
    demandDays: normalizeAmount(demandSnapshot.demandDays),
    allocatedDays,
    remainingDemandDays,
    overServiceDays,
    coverageRatePercent:
      demandSnapshot.demandDays === 0
        ? 100
        : normalizeAmount(Math.min(100, (allocatedDays / demandSnapshot.demandDays) * 100)),
    allocatedResourceCount,
  };
}

export function classifyDemandCoverageState(
  summary: Pick<DemandAllocationSummary, 'remainingDemandDays' | 'overServiceDays'>,
): DemandCoverageState {
  if (summary.remainingDemandDays > 0 && summary.overServiceDays > 0) {
    return 'mixed';
  }

  if (summary.remainingDemandDays > 0) {
    return 'uncovered';
  }

  if (summary.overServiceDays > 0) {
    return 'over-served';
  }

  return 'covered';
}

export interface CoverageBarSegment {
  kind: 'covered' | 'gap' | 'over-service';
  widthPercent: number;
}

/**
 * Compact visual breakdown of a demand/allocation cell for a coverage bar.
 * Scaled against max(demandDays, allocatedDays) so the covered+gap segments
 * always span exactly the demand width, and an over-service segment always
 * renders as a visible overflow past that width rather than being clipped.
 */
export function buildCoverageBarSegments(
  summary: Pick<
    DemandAllocationSummary,
    'demandDays' | 'allocatedDays' | 'remainingDemandDays' | 'overServiceDays'
  >,
): CoverageBarSegment[] {
  const demandDays = normalizeAmount(summary.demandDays);
  const allocatedDays = normalizeAmount(summary.allocatedDays);

  if (demandDays === 0 && allocatedDays === 0) {
    return [];
  }

  const baseDays = Math.max(demandDays, allocatedDays);
  const coveredDays = Math.min(allocatedDays, demandDays);
  const segments: CoverageBarSegment[] = [];

  if (coveredDays > 0) {
    segments.push({
      kind: 'covered',
      widthPercent: normalizeAmount((coveredDays / baseDays) * 100),
    });
  }

  if (summary.remainingDemandDays > 0) {
    segments.push({
      kind: 'gap',
      widthPercent: normalizeAmount((summary.remainingDemandDays / baseDays) * 100),
    });
  }

  if (summary.overServiceDays > 0) {
    segments.push({
      kind: 'over-service',
      widthPercent: normalizeAmount((summary.overServiceDays / baseDays) * 100),
    });
  }

  return segments;
}
