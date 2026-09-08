import type { Allocation, DemandSnapshot, Project, ResourceType } from '@/domain/entities';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';
import { buildDemandAllocationSummary, selectLatestDemandSnapshots } from '@/domain/calculations';

import { MONTH_LABELS } from '@/features/dashboard';

export interface DemandCoverageCell {
  month: number;
  label: string;
  demandDays: number;
  allocatedDays: number;
  remainingDemandDays: number;
  overServiceDays: number;
  coverageRatePercent: number;
  allocatedResourceCount: number;
}

export interface DemandCoverageRow {
  projectCode: string;
  projectName: string;
  resourceTypeId: string;
  resourceTypeLabel: string;
  months: DemandCoverageCell[];
  totalDemandDays: number;
  totalAllocatedDays: number;
  totalRemainingDemandDays: number;
  totalOverServiceDays: number;
}

export function buildDemandCoverageRows(options: {
  projects: readonly Project[];
  resourceTypes: readonly ResourceType[];
  demandSnapshots: readonly DemandSnapshot[];
  allocations: readonly Allocation[];
  year: number;
  projectSearch: string;
  resourceTypeFilter: string;
  showOnlyGaps: boolean;
}): DemandCoverageRow[] {
  const projectLookup = new Map(options.projects.map((project) => [project.code, project.name]));
  const resourceTypeLookup = new Map(
    options.resourceTypes.map((resourceType) => [resourceType.id, resourceType.label]),
  );
  const normalizedSearch = options.projectSearch.trim().toUpperCase();
  const latestSnapshots = selectLatestDemandSnapshots(options.demandSnapshots).filter(
    (snapshot) => snapshot.year === options.year,
  );
  const grouped = new Map<string, DemandCoverageRow>();

  for (const snapshot of latestSnapshots) {
    if (
      options.resourceTypeFilter !== 'all' &&
      snapshot.resourceTypeId !== options.resourceTypeFilter
    ) {
      continue;
    }

    const projectName = projectLookup.get(snapshot.projectCode) ?? snapshot.projectCode;
    if (
      normalizedSearch.length > 0 &&
      !snapshot.projectCode.includes(normalizedSearch) &&
      !projectName.toUpperCase().includes(normalizedSearch)
    ) {
      continue;
    }

    const key = `${snapshot.projectCode}::${snapshot.resourceTypeId}`;
    const existing = grouped.get(key) ?? {
      projectCode: snapshot.projectCode,
      projectName,
      resourceTypeId: snapshot.resourceTypeId,
      resourceTypeLabel: resourceTypeLookup.get(snapshot.resourceTypeId) ?? snapshot.resourceTypeId,
      months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        label: MONTH_LABELS[index] ?? `Month ${index + 1}`,
        demandDays: 0,
        allocatedDays: 0,
        remainingDemandDays: 0,
        overServiceDays: 0,
        coverageRatePercent: 100,
        allocatedResourceCount: 0,
      })),
      totalDemandDays: 0,
      totalAllocatedDays: 0,
      totalRemainingDemandDays: 0,
      totalOverServiceDays: 0,
    };
    const summary = buildDemandAllocationSummary({
      demandSnapshot: snapshot,
      allocations: options.allocations,
    });
    existing.months[snapshot.month - 1] = {
      month: snapshot.month,
      label: MONTH_LABELS[snapshot.month - 1] ?? `Month ${snapshot.month}`,
      demandDays: summary.demandDays,
      allocatedDays: summary.allocatedDays,
      remainingDemandDays: summary.remainingDemandDays,
      overServiceDays: summary.overServiceDays,
      coverageRatePercent: summary.coverageRatePercent,
      allocatedResourceCount: summary.allocatedResourceCount,
    };
    existing.totalDemandDays = normalizeAmount(existing.totalDemandDays + summary.demandDays);
    existing.totalAllocatedDays = normalizeAmount(
      existing.totalAllocatedDays + summary.allocatedDays,
    );
    existing.totalRemainingDemandDays = normalizeAmount(
      existing.totalRemainingDemandDays + summary.remainingDemandDays,
    );
    existing.totalOverServiceDays = normalizeAmount(
      existing.totalOverServiceDays + summary.overServiceDays,
    );
    grouped.set(key, existing);
  }

  return [...grouped.values()]
    .filter((row) => !options.showOnlyGaps || row.totalRemainingDemandDays > 0)
    .sort(
      (left, right) =>
        left.projectCode.localeCompare(right.projectCode, undefined, { sensitivity: 'base' }) ||
        left.resourceTypeLabel.localeCompare(right.resourceTypeLabel, undefined, {
          sensitivity: 'base',
        }),
    );
}
