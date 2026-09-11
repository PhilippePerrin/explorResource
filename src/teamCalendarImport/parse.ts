import * as XLSX from 'xlsx';

import { normalizeAmount } from '@/domain/normalization/normalizeAmount';
import { computeSha256Hex } from '@/import/hash';

import { classifyCalendarFill, decodeCalendarCell, normalizePersonName } from './decode';
import type {
  AnalyzeTeamCalendarImportRequest,
  StagedTeamCalendarMonthTotal,
  StagedTeamCalendarRawRow,
  TeamCalendarAnalysis,
  TeamCalendarAnomaly,
} from './types';
import {
  getCalendarCellStyle,
  getCellValue,
  locateTeamCalendarLayout,
  readTeamCalendarWorkbook,
  resolveTeamCalendarColumnDates,
  toTrimmedString,
} from './workbook';

function createAnomaly(
  anomaly: Omit<TeamCalendarAnomaly, 'id'>,
  anomalies: TeamCalendarAnomaly[],
): void {
  anomalies.push({
    id: `${anomaly.code}:${anomaly.rowNumber ?? 'n/a'}:${anomaly.cellRef ?? 'n/a'}:${anomaly.message}`,
    ...anomaly,
  });
}

export async function analyzeTeamCalendarWorkbook(
  request: AnalyzeTeamCalendarImportRequest,
): Promise<TeamCalendarAnalysis> {
  const fileSha256 = await computeSha256Hex(request.fileBuffer);
  const { worksheet, sheetName, range } = readTeamCalendarWorkbook(request.fileBuffer);
  const layout = locateTeamCalendarLayout(worksheet);
  const columnDates = resolveTeamCalendarColumnDates(worksheet, range, layout);

  const anomalies: TeamCalendarAnomaly[] = [];

  const duplicateOf = request.existingImportBatches.find(
    (batch) => batch.status === 'validated' && batch.fileSha256 === fileSha256,
  );

  if (duplicateOf) {
    createAnomaly(
      {
        code: 'duplicate-file',
        severity: 'blocking',
        message: `This file matches the SHA-256 of already imported batch "${duplicateOf.fileName}".`,
      },
      anomalies,
    );
  }

  const resourceByNormalizedName = new Map(
    request.resources
      .filter((resource) => resource.status === 'active')
      .map(
        (resource) =>
          [
            normalizePersonName(`${resource.firstName} ${resource.lastName}`),
            resource,
          ] as const,
      ),
  );

  const totalsByKey = new Map<string, StagedTeamCalendarMonthTotal>();
  const rawRows: StagedTeamCalendarRawRow[] = [];
  const flaggedUnknownNames = new Set<string>();

  let matchedResourceRows = 0;
  let unmatchedResourceRows = 0;
  let decodedCellCount = 0;
  let unrecognizedMarkingCount = 0;
  let conflictingMarkingCount = 0;

  for (const resourceRowIndex of layout.resourceRowIndexes) {
    const rowNumber = resourceRowIndex + 1;
    const resourceName = toTrimmedString(
      getCellValue(worksheet, resourceRowIndex, layout.nameColumnIndex),
    );

    if (!resourceName) {
      continue;
    }

    const normalizedName = normalizePersonName(resourceName);
    const matchedResource = resourceByNormalizedName.get(normalizedName);

    rawRows.push({
      rowNumber,
      resourceName,
      matchedResourceId: matchedResource?.id,
      rawCells: { name: resourceName },
    });

    if (!matchedResource) {
      unmatchedResourceRows += 1;

      if (!flaggedUnknownNames.has(normalizedName)) {
        flaggedUnknownNames.add(normalizedName);
        createAnomaly(
          {
            code: 'unknown-resource',
            severity: 'warning',
            message: `"${resourceName}" (row ${rowNumber}) does not match any active resource by name — either it isn't in the resource list, or it exists but isn't active. This resource's rows are skipped for this import; fix the name, or create/reactivate the resource, then re-import to pick them up.`,
            rowNumber,
          },
          anomalies,
        );
      }

      continue;
    }

    matchedResourceRows += 1;

    for (const columnDate of columnDates) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: resourceRowIndex, c: columnDate.columnIndex })];
      const fillKind = classifyCalendarFill(getCalendarCellStyle(cell));
      const decoded = decodeCalendarCell({ value: cell?.v, fillKind });

      if (decoded.anomaly) {
        const cellRef = XLSX.utils.encode_cell({
          r: resourceRowIndex,
          c: columnDate.columnIndex,
        });

        if (decoded.anomaly === 'unrecognized-marking') {
          unrecognizedMarkingCount += 1;
          createAnomaly(
            {
              code: 'unrecognized-marking',
              severity: 'warning',
              message: `${resourceName}, ${columnDate.month}/${columnDate.year} (${cellRef}): unrecognized marking — not counted, please review the source file.`,
              rowNumber,
              cellRef,
            },
            anomalies,
          );
        } else {
          conflictingMarkingCount += 1;
          createAnomaly(
            {
              code: 'conflicting-marking',
              severity: 'warning',
              message: `${resourceName}, ${columnDate.month}/${columnDate.year} (${cellRef}): cell has both a PTO fill and explicit text — counted as 0.5 day (text wins).`,
              rowNumber,
              cellRef,
            },
            anomalies,
          );
        }
      }

      if (decoded.days === 0) {
        continue;
      }

      decodedCellCount += 1;
      const key = `${matchedResource.id}-${columnDate.year}-${columnDate.month}`;
      const existingTotal = totalsByKey.get(key);

      if (existingTotal) {
        existingTotal.days = normalizeAmount(existingTotal.days + decoded.days);
      } else {
        totalsByKey.set(key, {
          resourceId: matchedResource.id,
          resourceName,
          year: columnDate.year,
          month: columnDate.month,
          days: decoded.days,
        });
      }
    }
  }

  const monthlyTotals = Array.from(totalsByKey.values()).filter((total) => total.days > 0);

  const statistics = {
    resourceRows: layout.resourceRowIndexes.length,
    matchedResourceRows,
    unmatchedResourceRows,
    decodedCellCount,
    unrecognizedMarkingCount,
    conflictingMarkingCount,
  };

  return {
    fileName: request.fileName,
    fileSize: request.fileSize,
    fileSha256,
    sheetName,
    monthlyTotals,
    rawRows,
    anomalies,
    statistics,
    duplicateOf: duplicateOf
      ? {
          id: duplicateOf.id,
          fileName: duplicateOf.fileName,
          importedAt: duplicateOf.importedAt,
          referenceDate: duplicateOf.referenceDate,
        }
      : undefined,
  };
}
