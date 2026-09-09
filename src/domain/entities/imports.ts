import { z } from 'zod';

import {
  hexSha256Schema,
  isoDateSchema,
  isoTimestampSchema,
  nonEmptyTrimmedStringSchema,
  optionalTrimmedStringSchema,
  timestampFieldsSchema,
  uuidSchema,
} from './base';

export const importBatchStatusSchema = z.enum(['draft', 'validated', 'cancelled']);
export const importBatchKindSchema = z.enum(['demand', 'resource']).default('demand');

const importBatchBaseSchema = z
  .object({
    id: uuidSchema,
    importedAt: isoTimestampSchema,
    referenceDate: isoDateSchema,
    note: optionalTrimmedStringSchema,
    fileName: nonEmptyTrimmedStringSchema,
    fileSha256: hexSha256Schema,
    rowCount: z.number().int().nonnegative(),
    status: importBatchStatusSchema,
    kind: importBatchKindSchema,
  })
  .strict();

export const importBatchSchema = importBatchBaseSchema.merge(timestampFieldsSchema).strict();
// ImportBatch immutability after validation depends on comparing against the
// previous persisted state, so it must be enforced by the repository/service layer.
export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importRawRowClassificationSchema = z.enum([
  'group',
  'project',
  'demand',
  'supply',
  'ambiguous',
  'ignored-header',
]);

const importRawRowBaseSchema = z
  .object({
    id: uuidSchema,
    importBatchId: uuidSchema,
    rowNumber: z.number().int().nonnegative(),
    rawCells: z.record(z.unknown()),
    classification: importRawRowClassificationSchema,
    classificationConfidence: z.union([z.number(), z.string()]).optional(),
    anomalyNotes: z.array(z.string()).default([]),
  })
  .strict();

export const importRawRowSchema = importRawRowBaseSchema.merge(timestampFieldsSchema).strict();
export type ImportRawRow = z.infer<typeof importRawRowSchema>;
