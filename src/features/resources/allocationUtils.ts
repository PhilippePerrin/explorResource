import { z } from 'zod';

import {
  allocationOriginSchema,
  isAllocationResourceTypeCompatible,
  monthSchema,
  projectCodeSchema,
  type Allocation,
  type DemandSnapshot,
  type Project,
  type Resource,
  type ResourceType,
} from '@/domain/entities';
import { chargeNonAffecteeProjet } from '@/domain/calculations';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';

const CURRENT_YEAR = new Date().getFullYear();

export interface AllocationFormValues {
  projectCode: string;
  resourceTypeId: string;
  year: number;
  month: number;
  allocatedDays: number;
  origin: Allocation['origin'];
}

export interface AllocationDemandStatus {
  matchingDemandSnapshot?: DemandSnapshot;
  demandDays: number | null;
  allocatedByOtherResourcesDays: number;
  remainingDemandBeforeAllocationDays: number | null;
  totalAllocatedAfterSaveDays: number;
  isOverService: boolean;
  overServiceDays: number;
}

function parseLocaleNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return Number.NaN;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return Number.NaN;
  }

  return Number(trimmed.replace(',', '.'));
}

function parseInteger(value: unknown): number {
  const parsed = parseLocaleNumber(value);

  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return Math.trunc(parsed);
}

export function sortProjectsForAllocation(projects: readonly Project[]): Project[] {
  return [...projects].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    return left.code.localeCompare(right.code, undefined, { sensitivity: 'base' });
  });
}

export function sortAllocations(allocations: readonly Allocation[]): Allocation[] {
  return [...allocations].sort((left, right) => {
    if (left.year !== right.year) {
      return right.year - left.year;
    }

    if (left.month !== right.month) {
      return right.month - left.month;
    }

    const projectComparison = left.projectCode.localeCompare(right.projectCode, undefined, {
      sensitivity: 'base',
    });

    if (projectComparison !== 0) {
      return projectComparison;
    }

    return left.origin.localeCompare(right.origin, undefined, { sensitivity: 'base' });
  });
}

export function findLatestDemandSnapshot(
  demandSnapshots: readonly DemandSnapshot[],
  allocation: Pick<Allocation, 'projectCode' | 'resourceTypeId' | 'year' | 'month'>,
): DemandSnapshot | undefined {
  return demandSnapshots
    .filter(
      (snapshot) =>
        snapshot.projectCode === allocation.projectCode &&
        snapshot.resourceTypeId === allocation.resourceTypeId &&
        snapshot.year === allocation.year &&
        snapshot.month === allocation.month,
    )
    .sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }

      return right.createdAt.localeCompare(left.createdAt);
    })[0];
}

export function buildAllocationDemandStatus({
  allocation,
  allAllocations,
  demandSnapshots,
}: {
  allocation: Pick<
    Allocation,
    'id' | 'projectCode' | 'resourceTypeId' | 'year' | 'month' | 'allocatedDays'
  >;
  allAllocations: readonly Allocation[];
  demandSnapshots: readonly DemandSnapshot[];
}): AllocationDemandStatus {
  const matchingDemandSnapshot = findLatestDemandSnapshot(demandSnapshots, allocation);

  if (!matchingDemandSnapshot) {
    return {
      matchingDemandSnapshot: undefined,
      demandDays: null,
      allocatedByOtherResourcesDays: 0,
      remainingDemandBeforeAllocationDays: null,
      totalAllocatedAfterSaveDays: allocation.allocatedDays,
      isOverService: false,
      overServiceDays: 0,
    };
  }

  const allocatedByOtherResourcesDays = normalizeAmount(
    allAllocations.reduce((total, existingAllocation) => {
      if (
        existingAllocation.id === allocation.id ||
        existingAllocation.projectCode !== allocation.projectCode ||
        existingAllocation.resourceTypeId !== allocation.resourceTypeId ||
        existingAllocation.year !== allocation.year ||
        existingAllocation.month !== allocation.month
      ) {
        return total;
      }

      return total + existingAllocation.allocatedDays;
    }, 0),
  );

  const remainingDemandBeforeAllocationDays = chargeNonAffecteeProjet(
    matchingDemandSnapshot.demandDays,
    allocatedByOtherResourcesDays,
  );
  const totalAllocatedAfterSaveDays = normalizeAmount(
    allocatedByOtherResourcesDays + allocation.allocatedDays,
  );
  const isOverService = allocation.allocatedDays > remainingDemandBeforeAllocationDays;
  const overServiceDays = isOverService
    ? normalizeAmount(allocation.allocatedDays - remainingDemandBeforeAllocationDays)
    : 0;

  return {
    matchingDemandSnapshot,
    demandDays: matchingDemandSnapshot.demandDays,
    allocatedByOtherResourcesDays,
    remainingDemandBeforeAllocationDays,
    totalAllocatedAfterSaveDays,
    isOverService,
    overServiceDays,
  };
}

export function createAllocationFormSchema(
  resource: Pick<Resource, 'resourceTypeId'>,
  resourceTypes: readonly ResourceType[],
  projects: readonly Project[],
) {
  return z
    .object({
      projectCode: projectCodeSchema,
      resourceTypeId: z.string().uuid('Resource type is required.'),
      year: z.preprocess(
        parseInteger,
        z.number({ invalid_type_error: 'Year is required.' }).int('Year must be a whole number.'),
      ),
      month: z.preprocess(parseInteger, monthSchema),
      allocatedDays: z.preprocess(
        parseLocaleNumber,
        z
          .number({ invalid_type_error: 'Allocated days are required.' })
          .refine(Number.isFinite, 'Allocated days are required.')
          .refine((value) => value >= 0, 'Allocated days cannot be negative.'),
      ),
      origin: allocationOriginSchema,
    })
    .superRefine((values, ctx) => {
      if (!projects.some((project) => project.code === values.projectCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['projectCode'],
          message: 'Select a valid project.',
        });
      }

      if (!resourceTypes.some((resourceType) => resourceType.id === values.resourceTypeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resourceTypeId'],
          message: 'Select a valid resource type.',
        });
      }

      if (
        !isAllocationResourceTypeCompatible(resource, {
          resourceTypeId: values.resourceTypeId,
        })
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resourceTypeId'],
          message: 'Allocation resource type must match the selected resource.',
        });
      }
    });
}

export function createAllocationDefaultValues(
  allocation?: Allocation,
  resource?: Pick<Resource, 'resourceTypeId'>,
): AllocationFormValues {
  return {
    projectCode: allocation?.projectCode ?? '',
    resourceTypeId: allocation?.resourceTypeId ?? resource?.resourceTypeId ?? '',
    year: allocation?.year ?? CURRENT_YEAR,
    month: allocation?.month ?? 1,
    allocatedDays: allocation?.allocatedDays ?? 0,
    origin: allocation?.origin ?? 'manual',
  };
}
