import type {
  Allocation,
  DemandSnapshot,
  Group,
  ImportBatch,
  ImportRawRow,
  Project,
  Resource,
  ResourceType,
} from '@/domain/entities';

export type ImportAnomalySeverity = 'blocking' | 'warning';

export interface ImportAnomaly {
  id: string;
  code:
    | 'ambiguous-row'
    | 'comment-derived-demand'
    | 'comment-gap-mismatch'
    | 'duplicate-file'
    | 'missing-project-context'
    | 'missing-project-name'
    | 'orphan-supply-row'
    | 'unknown-resource'
    | 'unknown-resource-type'
    | 'unparseable-comment'
    | 'unparseable-month-header';
  severity: ImportAnomalySeverity;
  message: string;
  rowNumber?: number;
  cellRef?: string;
}

export interface ImportMonthHeader {
  columnIndex: number;
  columnKey: string;
  month: number;
  year: number;
  label: string;
  cellRef: string;
}

export interface ParsedDemandCell {
  month: number;
  year: number;
  cellRef: string;
  gapDays: number | null;
  demandDays: number;
  supplyDays: number;
  source: 'comment' | 'derived';
}

export interface StagedImportRow {
  rowNumber: number;
  classification: ImportRawRow['classification'];
  classificationConfidence?: ImportRawRow['classificationConfidence'];
  anomalyNotes: string[];
  rawCells: Record<string, unknown>;
  parentGroupCode?: string;
  parentProjectCode?: string;
}

export interface StagedGroup {
  code: Group['code'];
  label: Group['label'];
}

export interface StagedProject {
  code: Project['code'];
  name: Project['name'];
  parentGroupCode?: Group['code'];
}

export interface StagedDemandSnapshot {
  projectCode: Project['code'];
  resourceTypeLabel: ResourceType['label'];
  resourceTypeId?: ResourceType['id'];
  year: DemandSnapshot['year'];
  month: DemandSnapshot['month'];
  demandDays: DemandSnapshot['demandDays'];
  supplyDays: DemandSnapshot['supplyDays'];
  origin: DemandSnapshot['origin'];
  rowNumber: number;
  cellRef: string;
  activity: string;
  parentGroupCode?: Group['code'];
  source: ParsedDemandCell['source'];
}

export interface StagedAllocation {
  resourceName: string;
  resourceId?: Resource['id'];
  projectCode: Allocation['projectCode'];
  resourceTypeLabel: ResourceType['label'];
  resourceTypeId?: ResourceType['id'];
  year: Allocation['year'];
  month: Allocation['month'];
  allocatedDays: Allocation['allocatedDays'];
  origin: Allocation['origin'];
  rowNumber: number;
  cellRef: string;
  activity: string;
}

export interface ImportStatistics {
  totalRows: number;
  groupRows: number;
  projectRows: number;
  demandRows: number;
  supplyRows: number;
  ambiguousRows: number;
  ignoredRows: number;
  demandSnapshotCount: number;
  allocationCount: number;
}

export interface ImportAnalysis {
  fileName: string;
  fileSize: number;
  fileSha256: string;
  sheetName: string;
  referenceYear: number;
  referenceDate: string;
  monthHeaders: ImportMonthHeader[];
  ignoredRowNumbers: number[];
  rawRows: StagedImportRow[];
  groups: StagedGroup[];
  projects: StagedProject[];
  demandSnapshots: StagedDemandSnapshot[];
  allocations: StagedAllocation[];
  anomalies: ImportAnomaly[];
  statistics: ImportStatistics;
  duplicateOf?: Pick<ImportBatch, 'id' | 'fileName' | 'importedAt' | 'referenceDate'>;
}

export interface ImportComparisonItem {
  key: string;
  projectCode: string;
  resourceTypeId: string;
  resourceTypeLabel: string;
  year: number;
  month: number;
  previousDemandDays: number;
  nextDemandDays: number;
  deltaDays: number;
  trend: 'increased' | 'decreased' | 'unchanged';
  projectState: 'new-project' | 'removed-project' | 'existing-project';
  resourceTypeState: 'resource-type-added' | 'resource-type-removed' | 'unchanged-resource-type';
  state: 'new' | 'removed' | 'increased' | 'decreased' | 'unchanged';
}

export interface ImportComparisonTotals {
  positiveDelta: number;
  negativeDelta: number;
  netDelta: number;
  itemCount: number;
  changedItemCount: number;
}

export interface ImportComparisonProjectSummary extends ImportComparisonTotals {
  projectCode: string;
  itemCount: number;
  newCount: number;
  removedCount: number;
  increasedCount: number;
  decreasedCount: number;
  unchangedCount: number;
  projectState: 'new-project' | 'removed-project' | 'existing-project';
  addedResourceTypeLabels: string[];
  removedResourceTypeLabels: string[];
}

export interface ImportComparisonDepartmentSummary extends ImportComparisonTotals {
  label: string;
}

export interface ImportComparisonSummary {
  previousBatch: Pick<ImportBatch, 'id' | 'fileName' | 'importedAt' | 'referenceDate'> | null;
  items: ImportComparisonItem[];
  positiveDelta: number;
  negativeDelta: number;
  netDelta: number;
  newCount: number;
  removedCount: number;
  increasedCount: number;
  decreasedCount: number;
  unchangedCount: number;
  departmentSummary: ImportComparisonDepartmentSummary;
  projectSummaries: ImportComparisonProjectSummary[];
}

export interface AnalyzeImportRequest {
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

export interface ImportCommitResult {
  importBatch: ImportBatch;
  createdProjects: number;
  updatedProjects: number;
  createdGroups: number;
  updatedGroups: number;
  upsertedAllocations: number;
  importedDemandSnapshots: number;
  importedRawRows: number;
}

export interface DemandRollbackPlanSnapshot {
  key: string;
  projectCode: DemandSnapshot['projectCode'];
  resourceTypeId: DemandSnapshot['resourceTypeId'];
  year: DemandSnapshot['year'];
  month: DemandSnapshot['month'];
  demandDays: DemandSnapshot['demandDays'];
  supplyDays: DemandSnapshot['supplyDays'];
  currentDemandDays: DemandSnapshot['demandDays'];
  currentSupplyDays: DemandSnapshot['supplyDays'];
  zeroedFromCurrent: boolean;
}

export interface DemandRollbackPlan {
  scope: { kind: 'all' } | { kind: 'project'; projectCode: DemandSnapshot['projectCode'] };
  targetImportBatchId: ImportBatch['id'];
  changedCount: number;
  unchangedCount: number;
  zeroedCount: number;
  snapshotsToCreate: DemandRollbackPlanSnapshot[];
}

export interface RestoreDemandFromImportBatchResult {
  restoredSnapshotCount: number;
  plan: DemandRollbackPlan;
}
