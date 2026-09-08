import { z } from 'zod';

import {
  isoTimestampSchema,
  monthSchema,
  nonNegativeNumberSchema,
  normalizedProjectCodeSchema,
  timestampFieldsSchema,
  uuidSchema,
  yearSchema,
} from './base';
import type { Resource } from './masterData';

const workingDaysCalendarBaseSchema = z
  .object({
    id: uuidSchema,
    year: yearSchema,
    month: monthSchema,
    workingDaysCount: nonNegativeNumberSchema,
  })
  .strict();

export const workingDaysCalendarSchema = workingDaysCalendarBaseSchema
  .merge(timestampFieldsSchema)
  .strict();
export type WorkingDaysCalendar = z.infer<typeof workingDaysCalendarSchema>;

const resourceNonWorkingDaysBaseSchema = z
  .object({
    id: uuidSchema,
    resourceId: uuidSchema,
    year: yearSchema,
    month: monthSchema,
    days: nonNegativeNumberSchema,
  })
  .strict();

export const resourceNonWorkingDaysSchema = resourceNonWorkingDaysBaseSchema
  .merge(timestampFieldsSchema)
  .strict();
export type ResourceNonWorkingDays = z.infer<typeof resourceNonWorkingDaysSchema>;

export const demandSnapshotOriginSchema = z.enum(['import', 'manual-adjustment']);

const demandSnapshotBaseSchema = z
  .object({
    id: uuidSchema,
    importBatchId: z.union([uuidSchema, z.literal('manual')]),
    projectCode: normalizedProjectCodeSchema,
    resourceTypeId: uuidSchema,
    year: yearSchema,
    month: monthSchema,
    demandDays: nonNegativeNumberSchema,
    supplyDays: nonNegativeNumberSchema,
    origin: demandSnapshotOriginSchema,
  })
  .strict();

export const demandSnapshotSchema = demandSnapshotBaseSchema
  .merge(timestampFieldsSchema)
  .strict()
  .superRefine((snapshot, ctx) => {
    if (snapshot.origin === 'import' && snapshot.importBatchId === 'manual') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['importBatchId'],
        message: 'importBatchId is required for imported demand snapshots.',
      });
    }

    if (snapshot.origin === 'manual-adjustment' && snapshot.importBatchId !== 'manual') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['importBatchId'],
        message: 'Manual adjustments must use the "manual" importBatchId marker.',
      });
    }
  });

export type DemandSnapshot = z.infer<typeof demandSnapshotSchema>;

export const allocationOriginSchema = z.enum(['import', 'manual', 'drag-and-drop']);

const allocationBaseSchema = z
  .object({
    id: uuidSchema,
    resourceId: uuidSchema,
    projectCode: normalizedProjectCodeSchema,
    resourceTypeId: uuidSchema,
    year: yearSchema,
    month: monthSchema,
    allocatedDays: nonNegativeNumberSchema,
    origin: allocationOriginSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const allocationSchema = allocationBaseSchema;
export type Allocation = z.infer<typeof allocationSchema>;

export function isAllocationResourceTypeCompatible(
  resource: Pick<Resource, 'resourceTypeId'>,
  allocation: Pick<Allocation, 'resourceTypeId'>,
  demandSnapshot?: Pick<DemandSnapshot, 'resourceTypeId'>,
): boolean {
  const expectedResourceTypeId = resource.resourceTypeId;

  if (allocation.resourceTypeId !== expectedResourceTypeId) {
    return false;
  }

  return demandSnapshot ? demandSnapshot.resourceTypeId === expectedResourceTypeId : true;
}
