import { getResourceFullName, PROJECT_CODE_REGEX } from '@/domain/entities';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';

import { getCellCommentText, parseDemandSupplyComment } from './comments';
import { computeSha256Hex } from './hash';
import type {
  AnalyzeImportRequest,
  ImportAnalysis,
  ImportAnomaly,
  ImportMonthHeader,
  ParsedDemandCell,
  StagedAllocation,
  StagedDemandSnapshot,
  StagedGroup,
  StagedImportRow,
  StagedProject,
} from './types';
import {
  getCell,
  getCellValue,
  getIgnoredRowNumbers,
  parseMonthHeaders,
  readImportWorkbook,
  toOptionalNumber,
  toTrimmedString,
} from './workbook';

const COLUMN_KEYS = Array.from({ length: 20 }, (_, columnIndex) =>
  String.fromCharCode('A'.charCodeAt(0) + columnIndex),
);

const HEADER_ROW_NUMBER = 2;
const FIRST_DATA_ROW_NUMBER = 2;
// The source PSA tool always rounds Demand/Supply to 1 decimal (nearest 0.1 day) in the comment
// text, while the underlying gap cell keeps unrounded precision. Two independent roundings can
// therefore push the reconstructed gap up to ~0.1 day away from the real cell value even when the
// comment is correct — confirmed against the production fixture (max observed diff 0.09).
const COMMENT_GAP_ROUNDING_TOLERANCE_DAYS = 0.1;
const PERSON_NAME_PATTERN =
  /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:-[A-Za-zÀ-ÖØ-öø-ÿ'’-]+)?(?:\s+[A-ZÀ-ÖØ-Ý' -]+)+$/;

interface ParsedLineCode {
  code: string;
  label: string;
}

interface ParserContext {
  currentGroupCode?: string;
  currentProjectCode?: string;
}

interface PendingDemandContext {
  rowNumber: number;
  projectCode?: string;
  parentGroupCode?: string;
  resourceTypeLabel: string;
  resourceTypeId?: string;
  activity: string;
  demandStatus?: string;
  monthValues: Array<{
    header: ImportMonthHeader;
    gapDays: number | null;
    commentText?: string;
    parsedComment: ReturnType<typeof parseDemandSupplyComment>;
    cellRef: string;
  }>;
  childSupplyByMonthKey: Map<string, number>;
}

function parseLineCode(value: string | undefined): ParsedLineCode | null {
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf(' - ');
  const code = (separatorIndex === -1 ? value : value.slice(0, separatorIndex)).trim();
  const label = (separatorIndex === -1 ? '' : value.slice(separatorIndex + 3)).trim();

  return code.length > 0 ? { code: code.toUpperCase(), label } : null;
}

function createAnomaly(
  anomaly: Omit<ImportAnomaly, 'id'>,
  anomalies: ImportAnomaly[],
  rowAnomalyNotes?: string[],
): void {
  const item: ImportAnomaly = {
    id: `${anomaly.code}:${anomaly.rowNumber ?? 'n/a'}:${anomaly.cellRef ?? 'n/a'}:${anomaly.message}`,
    ...anomaly,
  };
  anomalies.push(item);
  rowAnomalyNotes?.push(item.message);
}

function looksLikePersonName(value: string): boolean {
  return PERSON_NAME_PATTERN.test(value);
}

function isHeaderRow(rawCells: Record<string, unknown>): boolean {
  return (
    rawCells.A === '.' &&
    rawCells.C === 'Status' &&
    rawCells.D === 'Resource' &&
    rawCells.E === 'Activity'
  );
}

function buildRawCells(
  worksheet: ReturnType<typeof readImportWorkbook>['worksheet'],
  rowIndex: number,
): Record<string, unknown> {
  const rawCells: Record<string, unknown> = {};

  for (const [columnIndex, columnKey] of COLUMN_KEYS.entries()) {
    const cell = getCell(worksheet, rowIndex, columnIndex);
    rawCells[columnKey] = cell?.v ?? null;

    if (columnIndex >= 8) {
      const commentText = getCellCommentText(cell);
      if (commentText) {
        rawCells[`${columnKey}_comment`] = commentText;
      }
    }
  }

  return rawCells;
}

function buildMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function finalizePendingDemand(
  pendingDemand: PendingDemandContext | null,
  demandSnapshots: StagedDemandSnapshot[],
  anomalies: ImportAnomaly[],
  rowAnomalyNotesMap: Map<number, string[]>,
): void {
  if (!pendingDemand?.projectCode) {
    return;
  }

  const rowAnomalyNotes = rowAnomalyNotesMap.get(pendingDemand.rowNumber) ?? [];
  rowAnomalyNotesMap.set(pendingDemand.rowNumber, rowAnomalyNotes);

  for (const monthValue of pendingDemand.monthValues) {
    const fallbackSupply = normalizeAmount(
      pendingDemand.childSupplyByMonthKey.get(
        buildMonthKey(monthValue.header.year, monthValue.header.month),
      ) ?? 0,
    );
    const parsedComment = monthValue.parsedComment;
    const supplyDays = parsedComment?.supplyDays ?? fallbackSupply;
    const demandDays = parsedComment
      ? parsedComment.demandDays
      : normalizeAmount(supplyDays + (monthValue.gapDays ?? 0));
    const source: ParsedDemandCell['source'] = parsedComment ? 'comment' : 'derived';

    if (monthValue.gapDays !== null && parsedComment) {
      const reconstructedGap = normalizeAmount(parsedComment.demandDays - parsedComment.supplyDays);

      if (Math.abs(reconstructedGap - monthValue.gapDays) > COMMENT_GAP_ROUNDING_TOLERANCE_DAYS) {
        createAnomaly(
          {
            code: 'comment-gap-mismatch',
            severity: 'warning',
            message: `Row ${pendingDemand.rowNumber} ${monthValue.cellRef}: comment demand/supply do not match the numeric gap cell.`,
            rowNumber: pendingDemand.rowNumber,
            cellRef: monthValue.cellRef,
          },
          anomalies,
          rowAnomalyNotes,
        );
      }
    }

    if (!parsedComment && monthValue.gapDays !== null) {
      createAnomaly(
        {
          code: monthValue.commentText ? 'unparseable-comment' : 'comment-derived-demand',
          severity: 'warning',
          message: monthValue.commentText
            ? `Row ${pendingDemand.rowNumber} ${monthValue.cellRef}: comment could not be parsed; demand was derived from the gap value.`
            : `Row ${pendingDemand.rowNumber} ${monthValue.cellRef}: no comment found; demand was derived from the gap value.`,
          rowNumber: pendingDemand.rowNumber,
          cellRef: monthValue.cellRef,
        },
        anomalies,
        rowAnomalyNotes,
      );
    }

    if (demandDays === 0 && supplyDays === 0) {
      continue;
    }

    demandSnapshots.push({
      projectCode: pendingDemand.projectCode,
      resourceTypeLabel: pendingDemand.resourceTypeLabel,
      resourceTypeId: pendingDemand.resourceTypeId,
      year: monthValue.header.year,
      month: monthValue.header.month,
      demandDays,
      supplyDays,
      origin: 'import',
      rowNumber: pendingDemand.rowNumber,
      cellRef: monthValue.cellRef,
      activity: pendingDemand.activity,
      parentGroupCode: pendingDemand.parentGroupCode,
      source,
    });
  }
}

function classifyRow(options: {
  rowNumber: number;
  rawCells: Record<string, unknown>;
  ignoredRowNumbers: Set<number>;
  resourceTypeLabels: Set<string>;
  resourceNames: Set<string>;
  context: ParserContext;
}): {
  classification: StagedImportRow['classification'];
  confidence: number;
} {
  const { rowNumber, rawCells, ignoredRowNumbers, resourceTypeLabels, resourceNames, context } =
    options;
  const codeValue = toTrimmedString(rawCells.A);
  const statusValue = toTrimmedString(rawCells.C);
  const resourceValue = toTrimmedString(rawCells.D);
  const totalSupplyValue = toOptionalNumber(rawCells.F);
  const totalDemandValue = toOptionalNumber(rawCells.G);

  if (rowNumber === HEADER_ROW_NUMBER || isHeaderRow(rawCells)) {
    return { classification: 'ignored-header', confidence: 1 };
  }

  if (codeValue) {
    const parsedLine = parseLineCode(codeValue);

    if (parsedLine?.code && PROJECT_CODE_REGEX.test(parsedLine.code)) {
      return { classification: 'project', confidence: 0.98 };
    }

    if (parsedLine?.code && ignoredRowNumbers.has(rowNumber)) {
      return { classification: 'group', confidence: 0.96 };
    }

    return { classification: 'group', confidence: 0.8 };
  }

  if (!resourceValue && !statusValue && totalSupplyValue === null && totalDemandValue === null) {
    return {
      classification: 'ignored-header',
      confidence: ignoredRowNumbers.has(rowNumber) ? 0.9 : 0.6,
    };
  }

  const looksLikeResourceType =
    resourceValue !== undefined &&
    (resourceTypeLabels.has(resourceValue) || resourceValue.includes(' - '));
  const looksLikePerson =
    resourceValue !== undefined &&
    (resourceNames.has(resourceValue) ||
      (!looksLikeResourceType && looksLikePersonName(resourceValue)));

  if (
    resourceValue &&
    looksLikePerson &&
    context.currentProjectCode &&
    (totalDemandValue === 0 || !statusValue || statusValue.toLowerCase() === 'simulation')
  ) {
    return { classification: 'supply', confidence: statusValue ? 0.84 : 0.95 };
  }

  if (
    resourceValue &&
    context.currentProjectCode &&
    statusValue &&
    (looksLikeResourceType || totalDemandValue !== null || totalSupplyValue !== null)
  ) {
    return { classification: 'demand', confidence: looksLikeResourceType ? 0.95 : 0.78 };
  }

  if (resourceValue && context.currentProjectCode && looksLikePerson) {
    return { classification: 'supply', confidence: 0.74 };
  }

  return { classification: 'ambiguous', confidence: 0.3 };
}

function createReferenceDate(monthHeaders: ImportMonthHeader[]): string {
  const firstValidHeader = monthHeaders.find(
    (header) => Number.isInteger(header.year) && Number.isInteger(header.month),
  );

  if (!firstValidHeader) {
    return `${new Date().getFullYear()}-01-01`;
  }

  return `${firstValidHeader.year}-${String(firstValidHeader.month).padStart(2, '0')}-01`;
}

export async function analyzeImportWorkbook(
  request: AnalyzeImportRequest,
): Promise<ImportAnalysis> {
  const fileSha256 = await computeSha256Hex(request.fileBuffer);
  const { workbook, worksheet, sheetName, range } = readImportWorkbook(request.fileBuffer);
  const ignoredRowNumbers = getIgnoredRowNumbers(workbook, sheetName);
  const ignoredRowNumberSet = new Set(ignoredRowNumbers);
  const monthHeaders = parseMonthHeaders(worksheet);
  const anomalies: ImportAnomaly[] = [];
  const rawRows: StagedImportRow[] = [];
  const groups = new Map<string, StagedGroup>();
  const projects = new Map<string, StagedProject>();
  const demandSnapshots: StagedDemandSnapshot[] = [];
  const allocations: StagedAllocation[] = [];
  const rowAnomalyNotesMap = new Map<number, string[]>();
  const resourceTypeByLabel = new Map(
    request.resourceTypes
      .filter((resourceType) => resourceType.status === 'active')
      .map((resourceType) => [resourceType.label.trim(), resourceType] as const),
  );
  const resourceByName = new Map(
    request.resources
      .filter((resource) => resource.status === 'active')
      .map((resource) => [getResourceFullName(resource).trim(), resource] as const),
  );
  const duplicateOf = request.existingImportBatches.find(
    (batch) => batch.status === 'validated' && batch.fileSha256 === fileSha256,
  );
  const context: ParserContext = {};
  let pendingDemand: PendingDemandContext | null = null;

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

  for (const monthHeader of monthHeaders) {
    if (!Number.isInteger(monthHeader.year) || !Number.isInteger(monthHeader.month)) {
      createAnomaly(
        {
          code: 'unparseable-month-header',
          severity: 'blocking',
          message: `Unable to parse month header at ${monthHeader.cellRef} (${monthHeader.label || 'empty'}).`,
          cellRef: monthHeader.cellRef,
        },
        anomalies,
      );
    }
  }

  for (let rowNumber = FIRST_DATA_ROW_NUMBER; rowNumber <= range.e.r + 1; rowNumber += 1) {
    const rowIndex = rowNumber - 1;
    const rawCells = buildRawCells(worksheet, rowIndex);
    const anomalyNotes = rowAnomalyNotesMap.get(rowNumber) ?? [];
    rowAnomalyNotesMap.set(rowNumber, anomalyNotes);
    const classification = classifyRow({
      rowNumber,
      rawCells,
      ignoredRowNumbers: ignoredRowNumberSet,
      resourceTypeLabels: new Set(resourceTypeByLabel.keys()),
      resourceNames: new Set(resourceByName.keys()),
      context,
    });

    if (
      classification.classification === 'group' ||
      classification.classification === 'project' ||
      classification.classification === 'demand'
    ) {
      finalizePendingDemand(pendingDemand, demandSnapshots, anomalies, rowAnomalyNotesMap);
      pendingDemand = null;
    }

    const resourceLabel = toTrimmedString(rawCells.D);
    const activity = toTrimmedString(rawCells.E) ?? '';
    const codeLabel = parseLineCode(toTrimmedString(rawCells.A));

    const stagedRow: StagedImportRow = {
      rowNumber,
      classification: classification.classification,
      classificationConfidence: Number(classification.confidence.toFixed(2)),
      anomalyNotes,
      rawCells,
      parentGroupCode: context.currentGroupCode,
      parentProjectCode: context.currentProjectCode,
    };

    switch (classification.classification) {
      case 'group':
        if (codeLabel) {
          context.currentGroupCode = codeLabel.code;
          context.currentProjectCode = undefined;
          if (!codeLabel.label) {
            createAnomaly(
              {
                code: 'missing-project-name',
                severity: 'warning',
                message: `Group row ${rowNumber} does not contain a label.`,
                rowNumber,
              },
              anomalies,
              anomalyNotes,
            );
          }

          groups.set(codeLabel.code, {
            code: codeLabel.code,
            label: codeLabel.label || codeLabel.code,
          });
        }
        break;

      case 'project':
        if (codeLabel) {
          context.currentProjectCode = codeLabel.code;

          if (!codeLabel.label) {
            createAnomaly(
              {
                code: 'missing-project-name',
                severity: 'warning',
                message: `Project row ${rowNumber} does not contain a project name.`,
                rowNumber,
              },
              anomalies,
              anomalyNotes,
            );
          }

          projects.set(codeLabel.code, {
            code: codeLabel.code,
            name: codeLabel.label || codeLabel.code,
            parentGroupCode: context.currentGroupCode,
          });
        }
        break;

      case 'demand': {
        if (!context.currentProjectCode) {
          createAnomaly(
            {
              code: 'missing-project-context',
              severity: 'blocking',
              message: `Demand row ${rowNumber} is not attached to any project row.`,
              rowNumber,
            },
            anomalies,
            anomalyNotes,
          );
        }

        if (!resourceLabel) {
          createAnomaly(
            {
              code: 'unknown-resource-type',
              severity: 'blocking',
              message: `Demand row ${rowNumber} is missing its resource type label.`,
              rowNumber,
            },
            anomalies,
            anomalyNotes,
          );
        }

        const resourceType = resourceLabel ? resourceTypeByLabel.get(resourceLabel) : undefined;
        if (resourceLabel && !resourceType) {
          createAnomaly(
            {
              code: 'unknown-resource-type',
              severity: 'blocking',
              message: `Demand row ${rowNumber} uses unknown resource type "${resourceLabel}".`,
              rowNumber,
            },
            anomalies,
            anomalyNotes,
          );
        }

        pendingDemand = {
          rowNumber,
          projectCode: context.currentProjectCode,
          parentGroupCode: context.currentGroupCode,
          resourceTypeLabel: resourceLabel ?? 'Unknown resource type',
          resourceTypeId: resourceType?.id,
          activity,
          demandStatus: toTrimmedString(rawCells.C),
          monthValues: monthHeaders.map((header) => {
            const cell = getCell(worksheet, rowIndex, header.columnIndex);
            const cellRef = `${header.columnKey}${rowNumber}`;
            const gapValue = toOptionalNumber(cell?.v);

            return {
              header,
              gapDays: gapValue === null ? null : normalizeAmount(gapValue),
              commentText: getCellCommentText(cell),
              parsedComment: parseDemandSupplyComment(getCellCommentText(cell)),
              cellRef,
            };
          }),
          childSupplyByMonthKey: new Map<string, number>(),
        };
        break;
      }

      case 'supply': {
        if (!pendingDemand || !pendingDemand.projectCode) {
          createAnomaly(
            {
              code: 'orphan-supply-row',
              severity: 'blocking',
              message: `Supply row ${rowNumber} is not attached to a demand row.`,
              rowNumber,
            },
            anomalies,
            anomalyNotes,
          );
          break;
        }

        if (!resourceLabel) {
          createAnomaly(
            {
              code: 'unknown-resource',
              severity: 'blocking',
              message: `Supply row ${rowNumber} is missing its resource name.`,
              rowNumber,
            },
            anomalies,
            anomalyNotes,
          );
          break;
        }

        const resource = resourceByName.get(resourceLabel);
        if (!resource) {
          createAnomaly(
            {
              code: 'unknown-resource',
              severity: 'blocking',
              message: `Supply row ${rowNumber} references unknown resource "${resourceLabel}".`,
              rowNumber,
            },
            anomalies,
            anomalyNotes,
          );
        }

        for (const header of monthHeaders) {
          const cellRef = `${header.columnKey}${rowNumber}`;
          const value = normalizeAmount(
            toOptionalNumber(getCellValue(worksheet, rowIndex, header.columnIndex)) ?? 0,
          );

          if (value === 0) {
            continue;
          }

          const monthKey = buildMonthKey(header.year, header.month);
          pendingDemand.childSupplyByMonthKey.set(
            monthKey,
            normalizeAmount((pendingDemand.childSupplyByMonthKey.get(monthKey) ?? 0) + value),
          );

          allocations.push({
            resourceName: resourceLabel,
            resourceId: resource?.id,
            projectCode: pendingDemand.projectCode,
            resourceTypeLabel: pendingDemand.resourceTypeLabel,
            resourceTypeId: pendingDemand.resourceTypeId,
            year: header.year,
            month: header.month,
            allocatedDays: value,
            origin: 'import',
            rowNumber,
            cellRef,
            activity,
          });
        }
        break;
      }

      case 'ambiguous':
        createAnomaly(
          {
            code: 'ambiguous-row',
            severity: 'warning',
            message: `Row ${rowNumber} could not be classified automatically and requires review.`,
            rowNumber,
          },
          anomalies,
          anomalyNotes,
        );
        break;

      case 'ignored-header':
        break;
    }

    rawRows.push(stagedRow);
  }

  finalizePendingDemand(pendingDemand, demandSnapshots, anomalies, rowAnomalyNotesMap);

  for (const rawRow of rawRows) {
    rawRow.anomalyNotes = [...(rowAnomalyNotesMap.get(rawRow.rowNumber) ?? [])];
  }

  const firstMonthHeader = monthHeaders.find((header) => Number.isInteger(header.year));
  const referenceYear = firstMonthHeader?.year ?? new Date().getFullYear();

  return {
    fileName: request.fileName,
    fileSize: request.fileSize,
    fileSha256,
    sheetName,
    referenceYear,
    referenceDate: createReferenceDate(monthHeaders),
    monthHeaders,
    ignoredRowNumbers,
    rawRows,
    groups: Array.from(groups.values()),
    projects: Array.from(projects.values()),
    demandSnapshots,
    allocations,
    anomalies,
    statistics: {
      totalRows: rawRows.length,
      groupRows: rawRows.filter((row) => row.classification === 'group').length,
      projectRows: rawRows.filter((row) => row.classification === 'project').length,
      demandRows: rawRows.filter((row) => row.classification === 'demand').length,
      supplyRows: rawRows.filter((row) => row.classification === 'supply').length,
      ambiguousRows: rawRows.filter((row) => row.classification === 'ambiguous').length,
      ignoredRows: rawRows.filter((row) => row.classification === 'ignored-header').length,
      demandSnapshotCount: demandSnapshots.length,
      allocationCount: allocations.length,
    },
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
