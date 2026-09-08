import XLSX from 'xlsx';

import {
  IMPORT_MONTH_COLUMN_COUNT,
  IMPORT_MONTH_COLUMN_START_INDEX,
  MONTH_ABBREVIATIONS,
} from './constants';
import type { ImportMonthHeader } from './types';

const HEADER_ROW_INDEX = 1;

const MONTH_HEADER_PATTERN = /(\d{4}).*?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i;

export interface ImportWorkbook {
  workbook: XLSX.WorkBook;
  worksheet: XLSX.WorkSheet;
  sheetName: string;
  range: XLSX.Range;
}

export function readImportWorkbook(fileBuffer: ArrayBuffer): ImportWorkbook {
  const workbook = XLSX.read(new Uint8Array(fileBuffer), {
    type: 'array',
    cellComments: true,
    cellStyles: true,
    cellNF: true,
  } as unknown as XLSX.ParsingOptions);

  const preferredSheetName = workbook.SheetNames.find((name) =>
    name.trim().toLowerCase().startsWith('demandworkload'),
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

export function getCell(
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  columnIndex: number,
): XLSX.CellObject | undefined {
  return worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
}

export function getCellValue(
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  columnIndex: number,
): unknown {
  return getCell(worksheet, rowIndex, columnIndex)?.v;
}

export function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getIgnoredRowNumbers(workbook: XLSX.WorkBook, targetSheetName: string): number[] {
  const ignoredRows = new Set<number>();

  for (const name of workbook.Workbook?.Names ?? []) {
    if (!name.Name.startsWith('NO_IMPORT')) {
      continue;
    }

    const match = /\$([0-9]+):\$([0-9]+)/.exec(name.Ref);
    const sheetMatch = /^'?(.*?)'?!/.exec(name.Ref);
    const referencedSheetName = sheetMatch?.[1]?.replace(/''/g, "'");

    if (!match || referencedSheetName !== targetSheetName) {
      continue;
    }

    const startRow = Number(match[1]);
    const endRow = Number(match[2]);

    for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
      ignoredRows.add(rowNumber);
    }
  }

  return Array.from(ignoredRows).sort((left, right) => left - right);
}

export function parseMonthHeaders(worksheet: XLSX.WorkSheet): ImportMonthHeader[] {
  const headers: ImportMonthHeader[] = [];

  for (let offset = 0; offset < IMPORT_MONTH_COLUMN_COUNT; offset += 1) {
    const columnIndex = IMPORT_MONTH_COLUMN_START_INDEX + offset;
    const cellRef = XLSX.utils.encode_cell({ r: HEADER_ROW_INDEX, c: columnIndex });
    const rawValue = String(getCellValue(worksheet, HEADER_ROW_INDEX, columnIndex) ?? '');
    const sanitizedValue = rawValue.replaceAll(String.fromCharCode(7), '');
    const match = MONTH_HEADER_PATTERN.exec(sanitizedValue);

    if (!match) {
      headers.push({
        columnIndex,
        columnKey: XLSX.utils.encode_col(columnIndex),
        month: Number.NaN,
        year: Number.NaN,
        label: rawValue,
        cellRef,
      });
      continue;
    }

    const yearText = match[1];
    const monthText = match[2]?.toUpperCase() as keyof typeof MONTH_ABBREVIATIONS | undefined;
    const year = yearText ? Number(yearText) : Number.NaN;
    const month = monthText ? MONTH_ABBREVIATIONS[monthText] : undefined;

    headers.push({
      columnIndex,
      columnKey: XLSX.utils.encode_col(columnIndex),
      month: month ?? Number.NaN,
      year,
      label: `${monthText ?? 'UNK'} ${year}`,
      cellRef,
    });
  }

  return headers;
}
