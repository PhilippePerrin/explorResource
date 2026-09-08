import { z } from 'zod';

import {
  activeArchivedStatusSchema,
  isoDateSchema,
  nonEmptyTrimmedStringSchema,
  optionalTrimmedStringSchema,
  projectCodeSchema,
  PROJECT_CODE_REGEX,
  timestampFieldsSchema,
  uuidSchema,
} from './base';

const companyBaseSchema = z
  .object({
    id: uuidSchema,
    name: nonEmptyTrimmedStringSchema,
    status: activeArchivedStatusSchema,
  })
  .strict();

export const companySchema = companyBaseSchema.merge(timestampFieldsSchema).strict();
export type Company = z.infer<typeof companySchema>;

const resourceTypeBaseSchema = z
  .object({
    id: uuidSchema,
    label: nonEmptyTrimmedStringSchema,
    shortCode: optionalTrimmedStringSchema,
    color: nonEmptyTrimmedStringSchema,
    status: activeArchivedStatusSchema,
    displayOrder: z.number(),
  })
  .strict();

export const resourceTypeSchema = resourceTypeBaseSchema.merge(timestampFieldsSchema).strict();
export type ResourceType = z.infer<typeof resourceTypeSchema>;

export const collaborationTypeSchema = z.enum(['internal', 'external']);

const resourceBaseSchema = z
  .object({
    id: uuidSchema,
    firstName: nonEmptyTrimmedStringSchema,
    lastName: nonEmptyTrimmedStringSchema,
    resourceTypeId: uuidSchema,
    collaborationType: collaborationTypeSchema,
    companyId: uuidSchema.optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    status: activeArchivedStatusSchema,
  })
  .strict();

export const resourceSchema = resourceBaseSchema
  .merge(timestampFieldsSchema)
  .strict()
  .superRefine((resource, ctx) => {
    if (resource.collaborationType === 'external' && !resource.companyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['companyId'],
        message: 'companyId is required when collaborationType is external.',
      });
    }

    if (resource.startDate && resource.endDate && resource.endDate < resource.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be greater than or equal to startDate.',
      });
    }
  });

export type Resource = z.infer<typeof resourceSchema>;

export function getResourceFullName(resource: Pick<Resource, 'firstName' | 'lastName'>): string {
  return `${resource.firstName} ${resource.lastName}`.trim();
}

const releaseBaseSchema = z
  .object({
    id: uuidSchema,
    name: nonEmptyTrimmedStringSchema,
    goLiveDate: isoDateSchema,
    color: optionalTrimmedStringSchema,
    status: activeArchivedStatusSchema,
  })
  .strict();

export const releaseSchema = releaseBaseSchema.merge(timestampFieldsSchema).strict();
export type Release = z.infer<typeof releaseSchema>;

const projectBaseSchema = z
  .object({
    id: uuidSchema,
    code: projectCodeSchema,
    name: nonEmptyTrimmedStringSchema,
    status: activeArchivedStatusSchema,
  })
  .strict();

export const projectSchema = projectBaseSchema.merge(timestampFieldsSchema).strict();
export type Project = z.infer<typeof projectSchema>;

const groupBaseSchema = z
  .object({
    id: uuidSchema,
    code: nonEmptyTrimmedStringSchema.transform((value) => value.toUpperCase()),
    label: nonEmptyTrimmedStringSchema,
    status: activeArchivedStatusSchema,
  })
  .strict();

export const groupSchema = groupBaseSchema
  .merge(timestampFieldsSchema)
  .strict()
  .refine((group) => !PROJECT_CODE_REGEX.test(group.code), {
    message: 'Group codes are reserved for non-conforming project codes.',
    path: ['code'],
  });

export type Group = z.infer<typeof groupSchema>;

const projectReleaseBaseSchema = z
  .object({
    id: uuidSchema,
    projectId: uuidSchema,
    releaseId: uuidSchema,
  })
  .strict();

export const projectReleaseSchema = projectReleaseBaseSchema.merge(timestampFieldsSchema).strict();
export type ProjectRelease = z.infer<typeof projectReleaseSchema>;
