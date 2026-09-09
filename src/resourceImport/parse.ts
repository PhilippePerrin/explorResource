import { getResourceFullName } from '@/domain/entities';
import { computeSha256Hex } from '@/import/hash';

import type {
  AnalyzeResourceImportRequest,
  ResourceImportAnalysis,
  ResourceImportAnomaly,
  StagedResource,
  StagedResourceRawRow,
  StagedResourceType,
} from './types';
import { getCellValue, readResourceImportWorkbook, toTrimmedString } from './workbook';

const FIRST_DATA_ROW_NUMBER = 3;
const INACTIVE_PREFIX = '[Inactive Res.] ';

interface ResourceTypeLabelInfo {
  strippedLabel: string;
  isInactive: boolean;
  isResourceTypeShape: boolean;
}

function analyzeResourceTypeLabel(value: string): ResourceTypeLabelInfo {
  const isInactive = value.startsWith(INACTIVE_PREFIX);
  const strippedLabel = (isInactive ? value.slice(INACTIVE_PREFIX.length) : value).trim();

  return {
    strippedLabel,
    isInactive,
    isResourceTypeShape: strippedLabel.split(' - ').length === 3,
  };
}

function splitPersonName(displayName: string): { firstName: string; lastName: string } {
  const tokens = displayName.trim().split(/\s+/);
  const [firstName, ...lastNameParts] = tokens;

  return {
    firstName: firstName ?? displayName,
    lastName: lastNameParts.join(' '),
  };
}

function createAnomaly(
  anomaly: Omit<ResourceImportAnomaly, 'id'>,
  anomalies: ResourceImportAnomaly[],
): void {
  anomalies.push({
    id: `${anomaly.code}:${anomaly.rowNumber ?? 'n/a'}:${anomaly.message}`,
    ...anomaly,
  });
}

export async function analyzeResourceImportWorkbook(
  request: AnalyzeResourceImportRequest,
): Promise<ResourceImportAnalysis> {
  const fileSha256 = await computeSha256Hex(request.fileBuffer);
  const { worksheet, sheetName, range } = readResourceImportWorkbook(request.fileBuffer);

  const anomalies: ResourceImportAnomaly[] = [];
  const rawRows: StagedResourceRawRow[] = [];
  const resourceTypesToCreate = new Map<string, StagedResourceType>();
  const stagedResourceByKey = new Map<string, StagedResource>();
  const personTypesSeen = new Map<string, Set<string>>();
  const namesSeenUnderActiveType = new Set<string>();

  const activeResourceTypeLabels = new Set(
    request.resourceTypes
      .filter((resourceType) => resourceType.status === 'active')
      .map((resourceType) => resourceType.label.trim()),
  );
  const resourceByFullName = new Map(
    request.resources
      .filter((resource) => resource.status === 'active')
      .map((resource) => [getResourceFullName(resource).trim(), resource] as const),
  );
  const resourceTypeLabelById = new Map(
    request.resourceTypes.map(
      (resourceType) => [resourceType.id, resourceType.label.trim()] as const,
    ),
  );

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

  // The "[Inactive Res.] X" header only marks the single person-block immediately
  // following it as historical/inactive (confirmed on the real fixture: "Hassan ALAMI"
  // reappears once under an inactive marker for an ended assignment, then the listing
  // resumes with more currently-active people under the *original* active type, with no
  // new header row in between). It must never persist past that one person-block.
  let activeResourceTypeLabel: string | undefined;
  let pendingInactiveHeader = false;
  let currentPersonName: string | undefined;
  let currentPersonRowNumber: number | undefined;
  let currentPersonBlockInactive = false;
  let currentPersonHasDetail = false;
  let skippedInactiveCount = 0;

  function flushPersonIfEmpty(): void {
    if (
      currentPersonName &&
      !currentPersonBlockInactive &&
      !currentPersonHasDetail &&
      currentPersonRowNumber !== undefined &&
      activeResourceTypeLabel
    ) {
      createAnomaly(
        {
          code: 'ambiguous-row',
          severity: 'warning',
          message: `Row ${currentPersonRowNumber}: person "${currentPersonName}" has no assignment detail row under "${activeResourceTypeLabel}".`,
          rowNumber: currentPersonRowNumber,
        },
        anomalies,
      );
    }
  }

  for (let rowNumber = FIRST_DATA_ROW_NUMBER; rowNumber <= range.e.r + 1; rowNumber += 1) {
    const rowIndex = rowNumber - 1;
    const columnA = toTrimmedString(getCellValue(worksheet, rowIndex, 0));

    if (!columnA) {
      continue;
    }

    const rawCells: Record<string, unknown> = {
      A: columnA,
      B: getCellValue(worksheet, rowIndex, 1) ?? null,
      C: getCellValue(worksheet, rowIndex, 2) ?? null,
      D: getCellValue(worksheet, rowIndex, 3) ?? null,
      E: getCellValue(worksheet, rowIndex, 4) ?? null,
      F: getCellValue(worksheet, rowIndex, 5) ?? null,
    };

    if (columnA.includes('/')) {
      if (currentPersonBlockInactive) {
        skippedInactiveCount += 1;
        rawRows.push({ rowNumber, classification: 'detail', rawCells });
        continue;
      }

      if (!activeResourceTypeLabel) {
        createAnomaly(
          {
            code: 'orphan-detail-row',
            severity: 'warning',
            message: `Row ${rowNumber}: detail row found without a preceding resource-type header.`,
            rowNumber,
          },
          anomalies,
        );
        rawRows.push({ rowNumber, classification: 'ambiguous', rawCells });
        continue;
      }

      if (!currentPersonName) {
        createAnomaly(
          {
            code: 'orphan-detail-row',
            severity: 'warning',
            message: `Row ${rowNumber}: detail row found without a preceding person name.`,
            rowNumber,
          },
          anomalies,
        );
        rawRows.push({ rowNumber, classification: 'ambiguous', rawCells });
        continue;
      }

      const { firstName, lastName } = splitPersonName(currentPersonName);
      const fullName = `${firstName} ${lastName}`.trim();
      const key = `${activeResourceTypeLabel}::${fullName}`;

      if (!stagedResourceByKey.has(key)) {
        const existing = resourceByFullName.get(fullName);
        const existingTypeLabel = existing
          ? resourceTypeLabelById.get(existing.resourceTypeId)
          : undefined;
        const action: StagedResource['action'] = !existing
          ? 'create'
          : existingTypeLabel === activeResourceTypeLabel
            ? 'unchanged'
            : 'update';

        stagedResourceByKey.set(key, {
          firstName,
          lastName,
          resourceTypeLabel: activeResourceTypeLabel,
          matchedResourceId: existing?.id,
          previousResourceTypeLabel: existingTypeLabel,
          action,
          rowNumber: currentPersonRowNumber ?? rowNumber,
        });
      }

      currentPersonHasDetail = true;
      namesSeenUnderActiveType.add(fullName);
      const seenTypes = personTypesSeen.get(fullName) ?? new Set<string>();
      seenTypes.add(activeResourceTypeLabel);
      personTypesSeen.set(fullName, seenTypes);

      rawRows.push({ rowNumber, classification: 'detail', rawCells });
      continue;
    }

    const typeInfo = analyzeResourceTypeLabel(columnA);

    if (typeInfo.isResourceTypeShape) {
      flushPersonIfEmpty();
      currentPersonName = undefined;
      currentPersonRowNumber = undefined;
      currentPersonHasDetail = false;

      if (typeInfo.isInactive) {
        pendingInactiveHeader = true;
      } else {
        activeResourceTypeLabel = typeInfo.strippedLabel;
        pendingInactiveHeader = false;

        if (
          !activeResourceTypeLabels.has(typeInfo.strippedLabel) &&
          !resourceTypesToCreate.has(typeInfo.strippedLabel)
        ) {
          resourceTypesToCreate.set(typeInfo.strippedLabel, {
            label: typeInfo.strippedLabel,
            isNew: true,
          });
        }
      }

      rawRows.push({ rowNumber, classification: 'resource-type', rawCells });
      continue;
    }

    if (activeResourceTypeLabel || pendingInactiveHeader) {
      flushPersonIfEmpty();
      currentPersonName = columnA;
      currentPersonRowNumber = rowNumber;
      currentPersonHasDetail = false;
      currentPersonBlockInactive = pendingInactiveHeader;
      pendingInactiveHeader = false;
      rawRows.push({ rowNumber, classification: 'person', rawCells });
      continue;
    }

    rawRows.push({ rowNumber, classification: 'organizational', rawCells });
  }

  flushPersonIfEmpty();

  for (const [fullName, typeLabels] of personTypesSeen) {
    if (typeLabels.size > 1) {
      createAnomaly(
        {
          code: 'conflicting-resource-type',
          severity: 'blocking',
          message: `"${fullName}" appears under multiple active resource types in this file: ${[...typeLabels].join(', ')}.`,
        },
        anomalies,
      );
    }
  }

  const noLongerListed = request.resources
    .filter((resource) => resource.status === 'active')
    .filter((resource) => !namesSeenUnderActiveType.has(getResourceFullName(resource).trim()))
    .map((resource) => ({
      id: resource.id,
      firstName: resource.firstName,
      lastName: resource.lastName,
    }));

  const resources = Array.from(stagedResourceByKey.values());

  const statistics = {
    totalRows: rawRows.length,
    organizationalRows: rawRows.filter((row) => row.classification === 'organizational').length,
    resourceTypeRows: rawRows.filter((row) => row.classification === 'resource-type').length,
    personRows: rawRows.filter((row) => row.classification === 'person').length,
    detailRows: rawRows.filter((row) => row.classification === 'detail').length,
    ambiguousRows: rawRows.filter((row) => row.classification === 'ambiguous').length,
    skippedInactiveCount,
  };

  return {
    fileName: request.fileName,
    fileSize: request.fileSize,
    fileSha256,
    sheetName,
    rawRows,
    resourceTypesToCreate: Array.from(resourceTypesToCreate.values()),
    resources,
    noLongerListed,
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
