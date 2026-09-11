import * as XLSX from 'xlsx';

import { parseMonthAbbreviation, parsePlausibleYear, type CalendarCellStyle } from './decode';

export { getCell, getCellValue, toOptionalNumber, toTrimmedString } from '@/import/workbook';

const HEADER_SEARCH_ROW_LIMIT = 30;
const HEADER_SEARCH_COLUMN_LIMIT = 20;
const MONTH_LABEL = 'month';
const SKIPPABLE_LABELS = new Set(['week', 'day']);
const YEAR_SEARCH_ROW_SPAN = 10;

export interface TeamCalendarWorkbook {
  workbook: XLSX.WorkBook;
  worksheet: XLSX.WorkSheet;
  sheetName: string;
  range: XLSX.Range;
}

export function readTeamCalendarWorkbook(fileBuffer: ArrayBuffer): TeamCalendarWorkbook {
  const workbook = XLSX.read(new Uint8Array(fileBuffer), {
    type: 'array',
    cellStyles: true,
  } as unknown as XLSX.ParsingOptions);

  const preferredSheetName = workbook.SheetNames.find(
    (name) => name.trim().toLowerCase() === 'presence',
  );
  const sheetName = preferredSheetName ?? workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('The workbook does not contain any worksheet.');
  }

  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet?.['!ref']) {
    throw new Error(`Worksheet "${sheetName}" is empty or unreadable.`);
  }

  return {
    workbook,
    worksheet,
    sheetName,
    range: XLSX.utils.decode_range(worksheet['!ref']),
  };
}

export interface TeamCalendarLayout {
  /** Column holding resource names, and the header labels ("Month"/"Week"/"Day"). */
  nameColumnIndex: number;
  /** Row where the month-abbreviation header lives (also the "Month" label cell). */
  monthAbbreviationRowIndex: number;
  /** Row where the plausible 4-digit year lives, per data column. */
  yearRowIndex: number;
  /** First column holding actual calendar data (one column per day). */
  firstDataColumnIndex: number;
  /** Sheet rows (0-indexed) that hold one resource each, in file order. */
  resourceRowIndexes: number[];
}

function trimmedLower(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

/**
 * Locates the sheet's structural landmarks without hard-coding row/column
 * numbers, since the file is maintained by hand outside the app and rows can
 * shift between exports. Anchors on the "Month" label the sheet's own header
 * already carries next to the resource-name column.
 */
export function locateTeamCalendarLayout(worksheet: XLSX.WorkSheet): TeamCalendarLayout {
  let nameColumnIndex: number | undefined;
  let monthAbbreviationRowIndex: number | undefined;

  for (let r = 0; r < HEADER_SEARCH_ROW_LIMIT && monthAbbreviationRowIndex === undefined; r += 1) {
    for (let c = 0; c < HEADER_SEARCH_COLUMN_LIMIT; c += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      if (trimmedLower(cell?.v) === MONTH_LABEL) {
        monthAbbreviationRowIndex = r;
        nameColumnIndex = c;
        break;
      }
    }
  }

  if (nameColumnIndex === undefined || monthAbbreviationRowIndex === undefined) {
    throw new Error(
      'Could not locate the "Month" header cell — the sheet layout does not match the expected Team Calendar format.',
    );
  }

  const firstDataColumnIndex = nameColumnIndex + 1;

  let yearRowIndex: number | undefined;
  for (
    let r = Math.max(0, monthAbbreviationRowIndex - YEAR_SEARCH_ROW_SPAN);
    r < monthAbbreviationRowIndex && yearRowIndex === undefined;
    r += 1
  ) {
    const cell = worksheet[XLSX.utils.encode_cell({ r, c: firstDataColumnIndex })];
    if (parsePlausibleYear(cell?.v) !== undefined) {
      yearRowIndex = r;
    }
  }

  if (yearRowIndex === undefined) {
    throw new Error(
      'Could not locate the year header row above the "Month" row in the Team Calendar sheet.',
    );
  }

  const resourceRowIndexes: number[] = [];
  let scanRow = monthAbbreviationRowIndex + 1;
  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1:A1');
  let started = false;

  while (scanRow <= range.e.r) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: scanRow, c: nameColumnIndex })];
    const value = typeof cell?.v === 'string' ? cell.v.trim() : undefined;

    if (!value) {
      if (started) {
        break;
      }
      scanRow += 1;
      continue;
    }

    if (SKIPPABLE_LABELS.has(value.toLowerCase())) {
      scanRow += 1;
      continue;
    }

    started = true;
    resourceRowIndexes.push(scanRow);
    scanRow += 1;
  }

  if (resourceRowIndexes.length === 0) {
    throw new Error('Could not find any resource row below the Team Calendar header.');
  }

  return {
    nameColumnIndex,
    monthAbbreviationRowIndex,
    yearRowIndex,
    firstDataColumnIndex,
    resourceRowIndexes,
  };
}

export interface TeamCalendarColumnDate {
  columnIndex: number;
  year: number;
  month: number;
}

/** Every data column's (year, month), skipping columns with no plausible header. */
export function resolveTeamCalendarColumnDates(
  worksheet: XLSX.WorkSheet,
  range: XLSX.Range,
  layout: TeamCalendarLayout,
): TeamCalendarColumnDate[] {
  const columnDates: TeamCalendarColumnDate[] = [];

  for (let c = layout.firstDataColumnIndex; c <= range.e.c; c += 1) {
    const yearCell = worksheet[XLSX.utils.encode_cell({ r: layout.yearRowIndex, c })];
    const monthCell = worksheet[XLSX.utils.encode_cell({ r: layout.monthAbbreviationRowIndex, c })];
    const year = parsePlausibleYear(yearCell?.v);
    const month = parseMonthAbbreviation(monthCell?.v);

    if (year === undefined || month === undefined) {
      continue;
    }

    columnDates.push({ columnIndex: c, year, month });
  }

  return columnDates;
}

export function getCalendarCellStyle(cell: XLSX.CellObject | undefined): CalendarCellStyle | undefined {
  return cell?.s as CalendarCellStyle | undefined;
}
