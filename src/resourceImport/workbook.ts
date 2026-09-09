import * as XLSX from 'xlsx';

export { getCell, getCellValue, toOptionalNumber, toTrimmedString } from '@/import/workbook';

export interface ResourceImportWorkbook {
  workbook: XLSX.WorkBook;
  worksheet: XLSX.WorkSheet;
  sheetName: string;
  range: XLSX.Range;
}

export function readResourceImportWorkbook(fileBuffer: ArrayBuffer): ResourceImportWorkbook {
  const workbook = XLSX.read(new Uint8Array(fileBuffer), {
    type: 'array',
    cellComments: true,
    cellStyles: true,
    cellNF: true,
  } as unknown as XLSX.ParsingOptions);

  const preferredSheetName = workbook.SheetNames.find((name) =>
    name.trim().toLowerCase().startsWith('availability list'),
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
