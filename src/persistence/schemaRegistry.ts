import { z, ZodError } from 'zod';

import {
  allocationSchema,
  appSettingsSchema,
  auditEntrySchema,
  changeSetSchema,
  companySchema,
  demandSnapshotSchema,
  groupSchema,
  importBatchSchema,
  importRawRowSchema,
  projectReleaseSchema,
  projectSchema,
  releaseSchema,
  resourceNonWorkingDaysSchema,
  resourceSchema,
  resourceTypeSchema,
  workingDaysCalendarSchema,
} from '@/domain/entities';

import { PersistenceValidationError, formatZodIssues } from './errors';
import type { PlannerDB, StoreName } from './db';

export type StoreValue<K extends StoreName> = PlannerDB[K]['value'];

export const storeSchemas = {
  appSettings: appSettingsSchema,
  companies: companySchema,
  resourceTypes: resourceTypeSchema,
  resources: resourceSchema,
  releases: releaseSchema,
  projects: projectSchema,
  groups: groupSchema,
  projectReleases: projectReleaseSchema,
  workingDaysCalendars: workingDaysCalendarSchema,
  resourceNonWorkingDays: resourceNonWorkingDaysSchema,
  importBatches: importBatchSchema,
  importRawRows: importRawRowSchema,
  demandSnapshots: demandSnapshotSchema,
  allocations: allocationSchema,
  changeSets: changeSetSchema,
  auditEntries: auditEntrySchema,
} satisfies Record<StoreName, z.ZodTypeAny>;

export function validateStoreValue<K extends StoreName>(
  storeName: K,
  value: unknown,
): StoreValue<K> {
  try {
    return storeSchemas[storeName].parse(value) as StoreValue<K>;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new PersistenceValidationError(
        `Validation failed for store "${storeName}": ${formatZodIssues(error.issues)}.`,
        error.issues,
      );
    }

    throw error;
  }
}
