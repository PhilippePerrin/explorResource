import type { ImportBatch, Resource, ResourceType } from '@/domain/entities';

export type ResourceImportAnomalySeverity = 'blocking' | 'warning';

export interface ResourceImportAnomaly {
  id: string;
  code:
    | 'ambiguous-row'
    | 'duplicate-file'
    | 'orphan-detail-row'
    | 'person-without-resource-type'
    | 'conflicting-resource-type'
    | 'resource-type-change-blocked';
  severity: ResourceImportAnomalySeverity;
  message: string;
  rowNumber?: number;
}

export type StagedResourceRowClassification =
  'organizational' | 'resource-type' | 'person' | 'detail' | 'ambiguous';

export interface StagedResourceRawRow {
  rowNumber: number;
  classification: StagedResourceRowClassification;
  rawCells: Record<string, unknown>;
}

export interface StagedResourceType {
  label: string;
  isNew: boolean;
}

export type StagedResourceAction = 'create' | 'update' | 'unchanged';

export interface StagedResource {
  firstName: string;
  lastName: string;
  resourceTypeLabel: string;
  matchedResourceId?: Resource['id'];
  previousResourceTypeLabel?: string;
  action: StagedResourceAction;
  rowNumber: number;
}

export interface ResourceImportStatistics {
  totalRows: number;
  organizationalRows: number;
  resourceTypeRows: number;
  personRows: number;
  detailRows: number;
  ambiguousRows: number;
  skippedInactiveCount: number;
}

export interface ResourceImportAnalysis {
  fileName: string;
  fileSize: number;
  fileSha256: string;
  sheetName: string;
  rawRows: StagedResourceRawRow[];
  resourceTypesToCreate: StagedResourceType[];
  resources: StagedResource[];
  noLongerListed: Pick<Resource, 'id' | 'firstName' | 'lastName'>[];
  anomalies: ResourceImportAnomaly[];
  statistics: ResourceImportStatistics;
  duplicateOf?: Pick<ImportBatch, 'id' | 'fileName' | 'importedAt' | 'referenceDate'>;
}

export interface AnalyzeResourceImportRequest {
  fileName: string;
  fileSize: number;
  fileBuffer: ArrayBuffer;
  resourceTypes: Pick<ResourceType, 'id' | 'label' | 'status'>[];
  resources: Pick<Resource, 'id' | 'firstName' | 'lastName' | 'resourceTypeId' | 'status'>[];
  existingImportBatches: Pick<
    ImportBatch,
    'id' | 'fileName' | 'fileSha256' | 'importedAt' | 'referenceDate' | 'status'
  >[];
}

export interface ResourceImportSkippedTypeChange {
  resourceId: Resource['id'];
  fullName: string;
  attemptedResourceTypeLabel: string;
}

export interface ResourceImportCommitResult {
  importBatch: ImportBatch;
  createdResourceTypes: number;
  createdResources: number;
  updatedResources: number;
  unchangedResources: number;
  skippedTypeChanges: ResourceImportSkippedTypeChange[];
}
