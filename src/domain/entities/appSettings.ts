import { z } from 'zod';

import { positiveIntegerSchema } from './base';

export const DEFAULT_VISUAL_THRESHOLDS = {
  availableBelow: 80,
  usedFrom: 80,
  usedTo: 100,
  overloadFrom: 100,
  overloadTo: 110,
  criticalAbove: 110,
} as const;

export const themePreferenceSchema = z.enum(['light', 'dark', 'system']);

export const visualThresholdsSchema = z
  .object({
    availableBelow: z.number(),
    usedFrom: z.number(),
    usedTo: z.number(),
    overloadFrom: z.number(),
    overloadTo: z.number(),
    criticalAbove: z.number(),
  })
  .strict()
  .superRefine((thresholds, ctx) => {
    if (thresholds.usedFrom > thresholds.usedTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usedTo'],
        message: 'usedTo must be greater than or equal to usedFrom.',
      });
    }

    if (thresholds.overloadFrom > thresholds.overloadTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overloadTo'],
        message: 'overloadTo must be greater than or equal to overloadFrom.',
      });
    }

    if (thresholds.availableBelow > thresholds.usedFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usedFrom'],
        message: 'usedFrom must be greater than or equal to availableBelow.',
      });
    }

    if (thresholds.usedTo > thresholds.overloadFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overloadFrom'],
        message: 'overloadFrom must be greater than or equal to usedTo.',
      });
    }

    if (thresholds.overloadTo > thresholds.criticalAbove) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['criticalAbove'],
        message: 'criticalAbove must be greater than or equal to overloadTo.',
      });
    }
  });

export const appSettingsSchema = z
  .object({
    id: z.literal('app-settings').default('app-settings'),
    displayPrecision: z.number().int().min(0).default(1),
    visualThresholds: visualThresholdsSchema.default(DEFAULT_VISUAL_THRESHOLDS),
    numericTolerance: z.number().positive().default(1e-6),
    themePreference: themePreferenceSchema.default('system'),
    backupFormatVersion: positiveIntegerSchema.default(1),
    schemaVersion: positiveIntegerSchema.default(1),
  })
  .strict();

export type ThemePreference = z.infer<typeof themePreferenceSchema>;
export type VisualThresholds = z.infer<typeof visualThresholdsSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
