import { z } from 'zod';

import type { WorkingDaysCalendar } from '@/domain/entities';
import { capaciteBrute } from '@/domain/calculations';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';

export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface WorkingDaysFormValues {
  year: number;
  months: number[];
}

export const workingDaysFormSchema = z.object({
  year: z.number({ invalid_type_error: 'Year is required.' }).int('Year must be a whole number.'),
  months: z
    .array(z.number().nonnegative('Working days cannot be negative.'))
    .length(12, 'All 12 months are required.'),
});

export function createWorkingDaysFormValues(
  year: number,
  entries: readonly WorkingDaysCalendar[],
): WorkingDaysFormValues {
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const existingEntry = entries.find((entry) => entry.month === month);
    return existingEntry?.workingDaysCount ?? 0;
  });

  return { year, months };
}

export function calculateWorkingDaysTotal(months: readonly number[]): number {
  return normalizeAmount(
    months.reduce((total, value) => total + capaciteBrute({ workingDaysCount: value }), 0),
  );
}

export function createWorkingDaysMutationPayload(
  values: WorkingDaysFormValues,
  existingEntries: readonly WorkingDaysCalendar[],
  timestamp: string,
): WorkingDaysCalendar[] {
  return values.months.map((workingDaysCount, index) => {
    const month = index + 1;
    const existingEntry = existingEntries.find((entry) => entry.month === month);

    return {
      id: existingEntry?.id ?? crypto.randomUUID(),
      year: values.year,
      month,
      workingDaysCount,
      createdAt: existingEntry?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
  });
}

export function duplicateWorkingDaysToNextYear(
  source: WorkingDaysFormValues,
  targetYear: number,
  existingTargetEntries: readonly WorkingDaysCalendar[],
  timestamp: string,
): WorkingDaysCalendar[] {
  return createWorkingDaysMutationPayload(
    {
      year: targetYear,
      months: [...source.months],
    },
    existingTargetEntries,
    timestamp,
  );
}

export function parseLocaleNumber(value: unknown): number {
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
