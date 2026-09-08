import { z } from 'zod';

import { isoTimestampSchema, nonEmptyTrimmedStringSchema, uuidSchema } from './base';

export const changeTypeSchema = z.enum(['create', 'update', 'archive', 'delete']);

export const changeSetSchema = z
  .object({
    id: uuidSchema,
    entityType: nonEmptyTrimmedStringSchema,
    entityId: nonEmptyTrimmedStringSchema,
    changeType: changeTypeSchema,
    before: z.record(z.unknown()).optional(),
    after: z.record(z.unknown()).optional(),
    timestamp: isoTimestampSchema,
  })
  .strict();

export type ChangeSet = z.infer<typeof changeSetSchema>;

export const auditEntrySchema = z
  .object({
    id: uuidSchema,
    action: nonEmptyTrimmedStringSchema,
    details: z.union([z.string(), z.record(z.unknown())]),
    timestamp: isoTimestampSchema,
  })
  .strict();

export type AuditEntry = z.infer<typeof auditEntrySchema>;
