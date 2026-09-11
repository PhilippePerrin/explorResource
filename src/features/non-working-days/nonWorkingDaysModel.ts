import type { Resource, ResourceNonWorkingDays } from '@/domain/entities';
import { getResourceFullName } from '@/domain/entities';
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

export interface NonWorkingDayRow {
  resourceId: Resource['id'];
  resourceName: string;
  resourceStatus: Resource['status'];
  values: number[];
}

export interface NonWorkingDayTotals {
  rowTotals: Record<string, number>;
  columnTotals: number[];
  grandTotal: number;
}

export function parseLocaleNumber(value: string): number {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return 0;
  }

  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'));
}

export function buildNonWorkingDayRows(
  resources: readonly Resource[],
  entries: readonly ResourceNonWorkingDays[],
): NonWorkingDayRow[] {
  return [...resources]
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === 'active' ? -1 : 1;
      }

      return getResourceFullName(left).localeCompare(getResourceFullName(right), undefined, {
        sensitivity: 'base',
      });
    })
    .map((resource) => ({
      resourceId: resource.id,
      resourceName: getResourceFullName(resource),
      resourceStatus: resource.status,
      values: Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return (
          entries.find((entry) => entry.resourceId === resource.id && entry.month === month)
            ?.days ?? 0
        );
      }),
    }));
}

export function applyClipboardGrid(
  rows: readonly NonWorkingDayRow[],
  startRowIndex: number,
  startMonthIndex: number,
  clipboardGrid: readonly (readonly string[])[],
): NonWorkingDayRow[] {
  return rows.map((row, rowIndex) => {
    if (rowIndex < startRowIndex || rowIndex >= startRowIndex + clipboardGrid.length) {
      return row;
    }

    const clipboardRow = clipboardGrid[rowIndex - startRowIndex];

    if (!clipboardRow) {
      return row;
    }

    const nextValues = [...row.values];

    clipboardRow.forEach((cellValue, columnOffset) => {
      const monthIndex = startMonthIndex + columnOffset;

      if (monthIndex < 0 || monthIndex >= nextValues.length) {
        return;
      }

      nextValues[monthIndex] = parseLocaleNumber(cellValue);
    });

    return {
      ...row,
      values: nextValues,
    };
  });
}

export function setNonWorkingDayValue(
  rows: readonly NonWorkingDayRow[],
  rowIndex: number,
  monthIndex: number,
  rawValue: string,
): NonWorkingDayRow[] {
  return rows.map((row, index) => {
    if (index !== rowIndex) {
      return row;
    }

    const nextValues = [...row.values];
    nextValues[monthIndex] = parseLocaleNumber(rawValue);

    return { ...row, values: nextValues };
  });
}

export function calculateWorkingDaysReferenceTotal(
  workingDaysByMonth: readonly (number | null)[],
): number | null {
  const configuredValues = workingDaysByMonth.filter(
    (value): value is number => value !== null,
  );

  if (configuredValues.length === 0) {
    return null;
  }

  return normalizeAmount(configuredValues.reduce((total, value) => total + value, 0));
}

export function calculateNonWorkingDayTotals(
  rows: readonly NonWorkingDayRow[],
): NonWorkingDayTotals {
  const rowTotals = Object.fromEntries(
    rows.map((row) => [
      row.resourceId,
      normalizeAmount(row.values.reduce((total, value) => total + value, 0)),
    ]),
  );
  const columnTotals = Array.from({ length: 12 }, (_, monthIndex) =>
    normalizeAmount(rows.reduce((total, row) => total + (row.values[monthIndex] ?? 0), 0)),
  );
  const grandTotal = normalizeAmount(columnTotals.reduce((total, value) => total + value, 0));

  return {
    rowTotals,
    columnTotals,
    grandTotal,
  };
}

export function createNonWorkingDayMutationPlan(
  year: number,
  rows: readonly NonWorkingDayRow[],
  existingEntries: readonly ResourceNonWorkingDays[],
  timestamp: string,
): { upserts: ResourceNonWorkingDays[]; deletes: string[] } {
  const existingByKey = new Map<string, ResourceNonWorkingDays>(
    existingEntries.map((entry) => [`${entry.resourceId}-${entry.month}`, entry]),
  );
  const upserts: ResourceNonWorkingDays[] = [];
  const deletes: string[] = [];

  for (const row of rows) {
    row.values.forEach((days, index) => {
      const month = index + 1;
      const key = `${row.resourceId}-${month}`;
      const existingEntry = existingByKey.get(key);

      if (normalizeAmount(days) === 0) {
        if (existingEntry) {
          deletes.push(existingEntry.id);
        }

        return;
      }

      upserts.push({
        id: existingEntry?.id ?? crypto.randomUUID(),
        resourceId: row.resourceId,
        year,
        month,
        days,
        createdAt: existingEntry?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    });
  }

  return { upserts, deletes };
}

export function duplicateNonWorkingDayRows(rows: readonly NonWorkingDayRow[]): NonWorkingDayRow[] {
  return rows.map((row) => ({
    ...row,
    values: [...row.values],
  }));
}
