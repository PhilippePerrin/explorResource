import { z } from 'zod';

export const PROJECT_CODE_REGEX = /^[EPR]\d{4}$/;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const uuidSchema = z.string().uuid();
export const nonEmptyTrimmedStringSchema = z.string().trim().min(1);
export const optionalTrimmedStringSchema = z.string().trim().min(1).optional();
export const hexSha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, 'Expected a 64-character SHA-256 hex digest.');
export const isoDateSchema = z
  .string()
  .regex(ISO_DATE_REGEX, 'Expected an ISO date in YYYY-MM-DD format.');
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const activeArchivedStatusSchema = z.enum(['active', 'archived']);
export const monthSchema = z.number().int().min(1).max(12);
export const yearSchema = z.number().int();
export const nonNegativeNumberSchema = z.number().nonnegative();
export const positiveIntegerSchema = z.number().int().positive();
export const normalizedProjectCodeSchema = nonEmptyTrimmedStringSchema.transform((value) =>
  value.toUpperCase(),
);
export const projectCodeSchema = normalizedProjectCodeSchema.refine(
  (value) => PROJECT_CODE_REGEX.test(value),
  'Project codes must match ^[EPR]\\d{4}$ exactly.',
);
export const timestampFieldsSchema = z.object({
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type EntityStatus = z.infer<typeof activeArchivedStatusSchema>;
