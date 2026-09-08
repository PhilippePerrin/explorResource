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
