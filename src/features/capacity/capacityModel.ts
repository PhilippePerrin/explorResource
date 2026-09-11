import type {
  Allocation,
  AppSettings,
  Resource,
  ResourceNonWorkingDays,
  ResourceType,
  WorkingDaysCalendar,
} from '@/domain/entities';
import { getResourceFullName } from '@/domain/entities';
import { buildResourceYearSummaries, type ResourceMonthSummary } from '@/domain/calculations';

import { MONTH_LABELS } from '@/features/dashboard';
import { getResourceTypeDisplayLabel } from '@/features/resource-types';

export type CapacityFocus = 'year' | 's1' | 's2' | 'q1' | 'q2' | 'q3' | 'q4';

export interface CapacityRow {
  resource: Resource;
  resourceName: string;
  resourceTypeLabel: string;
  resourceTypeFullLabel: string;
  summaries: ResourceMonthSummary[];
}

const FOCUS_LABELS: Record<CapacityFocus, string> = {
  year: 'Year',
  s1: 'S1',
  s2: 'S2',
  q1: 'Q1',
  q2: 'Q2',
  q3: 'Q3',
  q4: 'Q4',
};

export function getFocusLabel(focus: CapacityFocus): string {
  return FOCUS_LABELS[focus];
}

export function getFocusMonths(focus: CapacityFocus): number[] {
  switch (focus) {
    case 's1':
      return [1, 2, 3, 4, 5, 6];
    case 's2':
      return [7, 8, 9, 10, 11, 12];
    case 'q1':
      return [1, 2, 3];
    case 'q2':
      return [4, 5, 6];
    case 'q3':
      return [7, 8, 9];
    case 'q4':
      return [10, 11, 12];
    case 'year':
    default:
      return Array.from({ length: 12 }, (_, index) => index + 1);
  }
}

export function buildCapacityRows(options: {
  resources: readonly Resource[];
  resourceTypes: readonly ResourceType[];
  allocations: readonly Allocation[];
  workingDaysCalendars: readonly WorkingDaysCalendar[];
  resourceNonWorkingDays: readonly ResourceNonWorkingDays[];
  appSettings?: AppSettings | null;
  year: number;
  searchTerm: string;
  resourceTypeFilter: string;
  companyFilter: string;
  statusFilter: 'all' | Resource['status'];
}): CapacityRow[] {
  const resourceTypeLookup = new Map(
    options.resourceTypes.map((resourceType) => [resourceType.id, resourceType]),
  );
  const normalizedSearch = options.searchTerm.trim().toUpperCase();

  return [...options.resources]
    .filter((resource) => {
      const matchesStatus =
        options.statusFilter === 'all' || resource.status === options.statusFilter;
      const resourceType = resourceTypeLookup.get(resource.resourceTypeId);
      const resourceTypeSearchText = resourceType
        ? `${resourceType.label} ${resourceType.shortCode ?? ''}`.toUpperCase()
        : resource.resourceTypeId.toUpperCase();
      const matchesType =
        options.resourceTypeFilter === 'all' ||
        resource.resourceTypeId === options.resourceTypeFilter;
      const matchesCompany =
        options.companyFilter === 'all' || (resource.companyId ?? '') === options.companyFilter;
      const resourceName = getResourceFullName(resource);
      const matchesSearch =
        normalizedSearch.length === 0 ||
        resourceName.toUpperCase().includes(normalizedSearch) ||
        resourceTypeSearchText.includes(normalizedSearch);

      return matchesStatus && matchesType && matchesCompany && matchesSearch;
    })
    .sort((left, right) => {
      const leftResourceType = resourceTypeLookup.get(left.resourceTypeId);
      const rightResourceType = resourceTypeLookup.get(right.resourceTypeId);
      const leftType = leftResourceType
        ? getResourceTypeDisplayLabel(leftResourceType)
        : left.resourceTypeId;
      const rightType = rightResourceType
        ? getResourceTypeDisplayLabel(rightResourceType)
        : right.resourceTypeId;
      return (
        leftType.localeCompare(rightType, undefined, { sensitivity: 'base' }) ||
        getResourceFullName(left).localeCompare(getResourceFullName(right), undefined, {
          sensitivity: 'base',
        })
      );
    })
    .map((resource) => {
      const resourceType = resourceTypeLookup.get(resource.resourceTypeId);

      return {
        resource,
        resourceName: getResourceFullName(resource),
        resourceTypeLabel: resourceType
          ? getResourceTypeDisplayLabel(resourceType)
          : resource.resourceTypeId,
        resourceTypeFullLabel: resourceType ? resourceType.label : resource.resourceTypeId,
        summaries: buildResourceYearSummaries({
          resource,
          year: options.year,
          workingDaysCalendars: options.workingDaysCalendars,
          resourceNonWorkingDays: options.resourceNonWorkingDays,
          allocations: options.allocations,
          appSettings: options.appSettings,
        }),
      };
    });
}

export function buildCapacityDrilldownTooltip(
  summary: ResourceMonthSummary,
  displayPrecision: number,
): string {
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: displayPrecision,
    minimumFractionDigits: 0,
  });
  return `${MONTH_LABELS[summary.month - 1]}: net ${formatter.format(summary.netCapacityDays)} d, allocated ${formatter.format(summary.assignedLoadDays)} d, available ${formatter.format(summary.availableCapacityDays)} d.`;
}
