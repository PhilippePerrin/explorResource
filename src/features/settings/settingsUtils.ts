import { z } from 'zod';

import { DEFAULT_VISUAL_THRESHOLDS, appSettingsSchema, type AppSettings } from '@/domain/entities';
import type { UtilizationThresholds } from '@/domain/calculations/utilization';

export interface SettingsFormValues {
  availableBelow: number;
  usedTo: number;
  overloadTo: number;
  criticalAbove: number;
}

export const settingsFormSchema = z
  .object({
    availableBelow: z
      .number({
        invalid_type_error: 'Available below must be a number.',
        required_error: 'Available below is required.',
      })
      .min(0, 'Available below must be at least 0%.'),
    usedTo: z
      .number({
        invalid_type_error: 'Used up to must be a number.',
        required_error: 'Used up to is required.',
      })
      .min(0, 'Used up to must be at least 0%.'),
    overloadTo: z
      .number({
        invalid_type_error: 'Overload up to must be a number.',
        required_error: 'Overload up to is required.',
      })
      .min(0, 'Overload up to must be at least 0%.'),
    criticalAbove: z
      .number({
        invalid_type_error: 'Critical overload from must be a number.',
        required_error: 'Critical overload from is required.',
      })
      .min(0, 'Critical overload from must be at least 0%.'),
  })
  .superRefine((values, ctx) => {
    if (values.availableBelow > values.usedTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usedTo'],
        message: 'Used up to must be greater than or equal to available below.',
      });
    }

    if (values.usedTo > values.overloadTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overloadTo'],
        message: 'Overload up to must be greater than or equal to used up to.',
      });
    }

    if (values.overloadTo > values.criticalAbove) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['criticalAbove'],
        message: 'Critical overload from must be greater than or equal to overload up to.',
      });
    }
  });

export function createDefaultAppSettings(): AppSettings {
  return appSettingsSchema.parse({});
}

export function resolveAppSettings(appSettings: AppSettings | null | undefined): AppSettings {
  return appSettings ?? createDefaultAppSettings();
}

export function createSettingsFormValues(
  thresholds: UtilizationThresholds = DEFAULT_VISUAL_THRESHOLDS,
): SettingsFormValues {
  return {
    availableBelow: thresholds.availableBelow,
    usedTo: thresholds.usedTo,
    overloadTo: thresholds.overloadTo,
    criticalAbove: thresholds.criticalAbove,
  };
}

export function toUtilizationThresholds(values: SettingsFormValues): UtilizationThresholds {
  return {
    availableBelow: values.availableBelow,
    usedFrom: values.availableBelow,
    usedTo: values.usedTo,
    overloadFrom: values.usedTo,
    overloadTo: values.overloadTo,
    criticalAbove: values.criticalAbove,
  };
}

export function applySettingsFormValues(
  appSettings: AppSettings,
  values: SettingsFormValues,
): AppSettings {
  return {
    ...appSettings,
    visualThresholds: toUtilizationThresholds(values),
  };
}

export function parsePercentageInput(value: unknown): number {
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
