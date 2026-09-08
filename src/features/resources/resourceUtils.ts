import { z } from 'zod';

import {
  DEFAULT_VISUAL_THRESHOLDS,
  activeArchivedStatusSchema,
  collaborationTypeSchema,
  getResourceFullName,
  type Allocation,
  type AppSettings,
  type Company,
  type Resource,
  type ResourceNonWorkingDays,
  type ResourceType,
  type WorkingDaysCalendar,
} from '@/domain/entities';
import {
  capaciteBrute,
  capaciteDisponible,
  capaciteNette,
  chargeAffectee,
  tauxUtilisation,
  type UtilizationResult,
} from '@/domain/calculations';

const ISO_DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface ResourceFormValues {
  firstName: string;
  lastName: string;
  resourceTypeId: string;
  collaborationType: Resource['collaborationType'];
  companyId: string;
  startDate: string;
  endDate: string;
  status: Resource['status'];
}

export interface ResourceReferenceData {
  allocations: readonly Pick<Allocation, 'resourceId'>[];
  nonWorkingDays: readonly Pick<ResourceNonWorkingDays, 'resourceId'>[];
}

export interface ResourceMonthlySummary {
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

function createOptionalIsoDateSchema(message: string) {
  return z
    .string()
    .trim()
    .default('')
    .refine((value) => value.length === 0 || ISO_DATE_INPUT_REGEX.test(value), message);
}

export function countResourceReferences(
  referenceData: ResourceReferenceData,
  resourceId: Resource['id'],
): number {
  return (
    referenceData.allocations.filter((allocation) => allocation.resourceId === resourceId).length +
    referenceData.nonWorkingDays.filter((entry) => entry.resourceId === resourceId).length
  );
}

export function sortResources(resources: readonly Resource[]): Resource[] {
  return [...resources].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    return getResourceFullName(left).localeCompare(getResourceFullName(right), undefined, {
      sensitivity: 'base',
    });
  });
}

export function sortResourceTypesForSelection(
  resourceTypes: readonly ResourceType[],
): ResourceType[] {
  return [...resourceTypes].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    if (left.displayOrder !== right.displayOrder) {
      return left.displayOrder - right.displayOrder;
    }

    return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
  });
}

export function sortCompaniesForSelection(companies: readonly Company[]): Company[] {
  return [...companies].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function createResourceFormSchema(
  resourceTypes: readonly ResourceType[],
  companies: readonly Company[],
  allocations: readonly Pick<Allocation, 'resourceId'>[],
  editingResource?: Pick<Resource, 'id' | 'resourceTypeId'>,
) {
  return z
    .object({
      firstName: z.string().trim().min(1, 'First name is required.'),
      lastName: z.string().trim().min(1, 'Last name is required.'),
      resourceTypeId: z.string().uuid('Resource type is required.'),
      collaborationType: collaborationTypeSchema,
      companyId: z.string().trim().default(''),
      startDate: createOptionalIsoDateSchema('Start date must use the YYYY-MM-DD format.'),
      endDate: createOptionalIsoDateSchema('End date must use the YYYY-MM-DD format.'),
      status: activeArchivedStatusSchema,
    })
    .superRefine((values, ctx) => {
      if (!resourceTypes.some((resourceType) => resourceType.id === values.resourceTypeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resourceTypeId'],
          message: 'Select a valid resource type.',
        });
      }

      if (values.collaborationType === 'external' && values.companyId.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['companyId'],
          message: 'Company is required for external resources.',
        });
      }

      if (
        values.companyId.length > 0 &&
        !companies.some((company) => company.id === values.companyId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['companyId'],
          message: 'Select a valid company.',
        });
      }

      if (values.startDate && values.endDate && values.endDate < values.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: 'End date must be greater than or equal to start date.',
        });
      }

      if (
        editingResource &&
        values.resourceTypeId !== editingResource.resourceTypeId &&
        allocations.some((allocation) => allocation.resourceId === editingResource.id)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resourceTypeId'],
          message:
            'Resource type cannot change while allocations exist. Archive and recreate the resource if needed.',
        });
      }
    });
}

export function createResourceDefaultValues(resource?: Resource): ResourceFormValues {
  return {
    firstName: resource?.firstName ?? '',
    lastName: resource?.lastName ?? '',
    resourceTypeId: resource?.resourceTypeId ?? '',
    collaborationType: resource?.collaborationType ?? 'internal',
    companyId: resource?.companyId ?? '',
    startDate: resource?.startDate ?? '',
    endDate: resource?.endDate ?? '',
    status: resource?.status ?? 'active',
  };
}

export function buildResourceMonthlySummary({
  resource,
  year,
  month,
  workingDaysCalendars,
  resourceNonWorkingDays,
  allocations,
  appSettings,
}: {
  resource: Resource;
  year: number;
  month: number;
  workingDaysCalendars: readonly WorkingDaysCalendar[];
  resourceNonWorkingDays: readonly ResourceNonWorkingDays[];
  allocations: readonly Allocation[];
  appSettings?: AppSettings | null;
}): ResourceMonthlySummary {
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
