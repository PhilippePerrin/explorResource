import { z } from 'zod';

import type { Allocation, DemandSnapshot, Resource, ResourceType } from '@/domain/entities';

export interface ResourceTypeFormValues {
  label: string;
  shortCode: string;
  color: string;
  displayOrder: number;
}

export interface ResourceTypeReferenceData {
  resources: readonly Pick<Resource, 'resourceTypeId'>[];
  demandSnapshots: readonly Pick<DemandSnapshot, 'resourceTypeId'>[];
  allocations: readonly Pick<Allocation, 'resourceTypeId'>[];
}

export function countResourceTypeReferences(
  referenceData: ResourceTypeReferenceData,
  resourceTypeId: ResourceType['id'],
): number {
  const { resources, demandSnapshots, allocations } = referenceData;

  return (
    resources.filter((resource) => resource.resourceTypeId === resourceTypeId).length +
    demandSnapshots.filter((snapshot) => snapshot.resourceTypeId === resourceTypeId).length +
    allocations.filter((allocation) => allocation.resourceTypeId === resourceTypeId).length
  );
}

export function sortResourceTypes(resourceTypes: readonly ResourceType[]): ResourceType[] {
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

export function createResourceTypeFormSchema(
  resourceTypes: readonly ResourceType[],
  editingResourceTypeId?: ResourceType['id'],
) {
  return z.object({
    label: z
      .string()
      .trim()
      .min(1, 'Label is required.')
      .refine(
        (value) =>
          !resourceTypes.some(
            (resourceType) =>
              resourceType.id !== editingResourceTypeId &&
              resourceType.label.localeCompare(value, undefined, { sensitivity: 'base' }) === 0,
          ),
        'Label must be unique.',
      ),
    shortCode: z.string().trim(),
    color: z.string().trim().min(1, 'Color is required.'),
    displayOrder: z
      .number({ invalid_type_error: 'Display order is required.' })
      .int('Display order must be a whole number.')
      .nonnegative('Display order cannot be negative.'),
  });
}

export function createResourceTypeDefaultValues(
  resourceType?: ResourceType,
  nextDisplayOrder = 0,
): ResourceTypeFormValues {
  return {
    label: resourceType?.label ?? '',
    shortCode: resourceType?.shortCode ?? '',
    color: resourceType?.color ?? '#00427f',
    displayOrder: resourceType?.displayOrder ?? nextDisplayOrder,
  };
}

export function getNextDisplayOrder(resourceTypes: readonly ResourceType[]): number {
  return (
    resourceTypes.reduce(
      (maxOrder, resourceType) => Math.max(maxOrder, resourceType.displayOrder),
      -1,
    ) + 1
  );
}
