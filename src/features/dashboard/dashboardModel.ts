import type {
  Allocation,
  AppSettings,
  DemandSnapshot,
  ImportBatch,
  Resource,
  ResourceNonWorkingDays,
  WorkingDaysCalendar,
} from '@/domain/entities';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';
import {
  buildDemandAllocationSummary,
  buildResourceMonthSummary,
  selectLatestDemandSnapshots,
  tauxUtilisation,
  type ResourceMonthSummary,
} from '@/domain/calculations';

export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface DashboardMonthMetrics {
  month: number;
  label: string;
  netCapacityDays: number;
  assignedLoadDays: number;
  availableCapacityDays: number;
  remainingDemandDays: number;
  overServiceDays: number;
  overloadedResourcesCount: number;
  criticalResourcesCount: number;
  utilization: ResourceMonthSummary['utilization'];
}

export interface DashboardAlert {
  id: string;
  tone: 'warning' | 'danger' | 'info';
  icon: string;
  title: string;
  description: string;
}

export interface DemandVariationSummary {
  latestBatchLabel: string;
  previousBatchLabel: string;
  positiveDeltaDays: number;
  negativeDeltaDays: number;
  netDeltaDays: number;
}

export interface DashboardViewModel {
  months: DashboardMonthMetrics[];
  selectedMonthMetrics: DashboardMonthMetrics;
  yearTotals: {
    netCapacityDays: number;
    assignedLoadDays: number;
    availableCapacityDays: number;
    remainingDemandDays: number;
    overServiceDays: number;
  };
  yearUtilization: ResourceMonthSummary['utilization'];
  alerts: DashboardAlert[];
  underServedProjectsCount: number;
  demandVariation: DemandVariationSummary | null;
}

function createEmptyMonthMetrics(month: number): DashboardMonthMetrics {
  return {
    month,
    label: MONTH_LABELS[month - 1] ?? `Month ${month}`,
    netCapacityDays: 0,
    assignedLoadDays: 0,
    availableCapacityDays: 0,
    remainingDemandDays: 0,
    overServiceDays: 0,
    overloadedResourcesCount: 0,
    criticalResourcesCount: 0,
    utilization: {
      ratePercent: 0,
      status: 'available',
      isCriticalOverload: false,
    },
  };
}

function compareBatchRecency(
  left: Pick<ImportBatch, 'importedAt'>,
  right: Pick<ImportBatch, 'importedAt'>,
): number {
  return right.importedAt.localeCompare(left.importedAt);
}

function buildBatchDemandMap(
  demandSnapshots: readonly DemandSnapshot[],
  batchId: string,
  year: number,
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const snapshot of demandSnapshots) {
    if (snapshot.importBatchId !== batchId || snapshot.year !== year) {
      continue;
    }

    const key = `${snapshot.projectCode}::${snapshot.resourceTypeId}::${snapshot.month}`;
    totals.set(key, normalizeAmount((totals.get(key) ?? 0) + snapshot.demandDays));
  }

  return totals;
}

export function buildDemandVariationSummary(options: {
  demandSnapshots: readonly DemandSnapshot[];
  importBatches: readonly ImportBatch[];
  year: number;
}): DemandVariationSummary | null {
  const validatedBatches = [...options.importBatches]
    .filter((batch) => batch.status === 'validated')
    .sort(compareBatchRecency);
  const latestBatch = validatedBatches[0];
  const previousBatch = validatedBatches[1];

  if (!latestBatch || !previousBatch) {
    return null;
  }

  const latestMap = buildBatchDemandMap(options.demandSnapshots, latestBatch.id, options.year);
  const previousMap = buildBatchDemandMap(options.demandSnapshots, previousBatch.id, options.year);
  const keys = [...new Set([...latestMap.keys(), ...previousMap.keys()])];
  let positiveDeltaDays = 0;
  let negativeDeltaDays = 0;

  for (const key of keys) {
    const delta = normalizeAmount((latestMap.get(key) ?? 0) - (previousMap.get(key) ?? 0));

    if (delta > 0) {
      positiveDeltaDays += delta;
    } else if (delta < 0) {
      negativeDeltaDays += delta;
    }
  }

  return {
    latestBatchLabel: latestBatch.fileName,
    previousBatchLabel: previousBatch.fileName,
    positiveDeltaDays: normalizeAmount(positiveDeltaDays),
    negativeDeltaDays: normalizeAmount(negativeDeltaDays),
    netDeltaDays: normalizeAmount(positiveDeltaDays + negativeDeltaDays),
  };
}

export function buildDashboardViewModel(options: {
  resources: readonly Resource[];
  allocations: readonly Allocation[];
  demandSnapshots: readonly DemandSnapshot[];
  workingDaysCalendars: readonly WorkingDaysCalendar[];
  resourceNonWorkingDays: readonly ResourceNonWorkingDays[];
  appSettings?: AppSettings | null;
  importBatches: readonly ImportBatch[];
  year: number;
  selectedMonth: number;
}): DashboardViewModel {
  const activeResources = options.resources.filter((resource) => resource.status === 'active');
  const months = Array.from({ length: 12 }, (_, index) => createEmptyMonthMetrics(index + 1));
  const latestSnapshots = selectLatestDemandSnapshots(options.demandSnapshots).filter(
    (snapshot) => snapshot.year === options.year,
  );

  for (const resource of activeResources) {
    for (let month = 1; month <= 12; month += 1) {
      const summary = buildResourceMonthSummary({
        resource,
        year: options.year,
        month,
        workingDaysCalendars: options.workingDaysCalendars,
        resourceNonWorkingDays: options.resourceNonWorkingDays,
        allocations: options.allocations,
        appSettings: options.appSettings,
      });
      const bucket = months[month - 1];

      if (!bucket) {
        continue;
      }

      bucket.netCapacityDays = normalizeAmount(bucket.netCapacityDays + summary.netCapacityDays);
      bucket.assignedLoadDays = normalizeAmount(bucket.assignedLoadDays + summary.assignedLoadDays);
      bucket.availableCapacityDays = normalizeAmount(
        bucket.availableCapacityDays + summary.availableCapacityDays,
      );

      if (
        summary.utilization.status === 'overload' ||
        summary.utilization.status === 'critical-overload'
      ) {
        bucket.overloadedResourcesCount += 1;
      }

      if (summary.utilization.status === 'critical-overload') {
        bucket.criticalResourcesCount += 1;
      }
    }
  }

  const underServedProjects = new Set<string>();

  for (const snapshot of latestSnapshots) {
    const summary = buildDemandAllocationSummary({
      demandSnapshot: snapshot,
      allocations: options.allocations,
    });
    const bucket = months[snapshot.month - 1];

    if (!bucket) {
      continue;
    }

    bucket.remainingDemandDays = normalizeAmount(
      bucket.remainingDemandDays + summary.remainingDemandDays,
    );
    bucket.overServiceDays = normalizeAmount(bucket.overServiceDays + summary.overServiceDays);

    if (summary.remainingDemandDays > 0) {
      underServedProjects.add(snapshot.projectCode);
    }
  }

  for (const bucket of months) {
    bucket.utilization = tauxUtilisation(
      bucket.assignedLoadDays,
      bucket.netCapacityDays,
      options.appSettings?.visualThresholds,
    );
  }

  const yearTotals = months.reduce(
    (totals, month) => ({
      netCapacityDays: normalizeAmount(totals.netCapacityDays + month.netCapacityDays),
      assignedLoadDays: normalizeAmount(totals.assignedLoadDays + month.assignedLoadDays),
      availableCapacityDays: normalizeAmount(
        totals.availableCapacityDays + month.availableCapacityDays,
      ),
      remainingDemandDays: normalizeAmount(totals.remainingDemandDays + month.remainingDemandDays),
      overServiceDays: normalizeAmount(totals.overServiceDays + month.overServiceDays),
    }),
    {
      netCapacityDays: 0,
      assignedLoadDays: 0,
      availableCapacityDays: 0,
      remainingDemandDays: 0,
      overServiceDays: 0,
    },
  );
  const yearUtilization = tauxUtilisation(
    yearTotals.assignedLoadDays,
    yearTotals.netCapacityDays,
    options.appSettings?.visualThresholds,
  );
  const selectedMonthMetrics =
    months[Math.max(0, Math.min(11, options.selectedMonth - 1))] ?? months[0]!;
  const alerts: DashboardAlert[] = [];

  if (selectedMonthMetrics.criticalResourcesCount > 0) {
    alerts.push({
      id: 'critical-overload',
      tone: 'danger',
      icon: '\u26D4',
      title: 'Critical overload detected',
      description: `${selectedMonthMetrics.criticalResourcesCount} resource(s) exceed the critical threshold in ${selectedMonthMetrics.label}.`,
    });
  }

  if (selectedMonthMetrics.overloadedResourcesCount > 0) {
    alerts.push({
      id: 'overload',
      tone: 'warning',
      icon: '\u26A0',
      title: 'Overloaded resources need review',
      description: `${selectedMonthMetrics.overloadedResourcesCount} resource(s) are overloaded in ${selectedMonthMetrics.label}.`,
    });
  }

  if (selectedMonthMetrics.remainingDemandDays > 0) {
    alerts.push({
      id: 'coverage-gap',
      tone: 'info',
      icon: '\u2139',
      title: 'Demand remains uncovered',
      description: `${selectedMonthMetrics.remainingDemandDays} d remain uncovered in ${selectedMonthMetrics.label}.`,
    });
  }

  return {
    months,
    selectedMonthMetrics,
    yearTotals,
    yearUtilization,
    alerts,
    underServedProjectsCount: underServedProjects.size,
    demandVariation: buildDemandVariationSummary({
      demandSnapshots: options.demandSnapshots,
      importBatches: options.importBatches,
      year: options.year,
    }),
  };
}
