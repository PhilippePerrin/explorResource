import type { ImportBatch, Resource } from '@/domain/entities';

export type TeamCalendarAnomalySeverity = 'blocking' | 'warning';

export interface TeamCalendarAnomaly {
  id: string;
  code: 'duplicate-file' | 'unknown-resource' | 'unrecognized-marking' | 'conflicting-marking';
  severity: TeamCalendarAnomalySeverity;
  message: string;
  rowNumber?: number;
  cellRef?: string;
}

export interface StagedTeamCalendarMonthTotal {
  resourceId: Resource['id'];
  resourceName: string;
  year: number;
  month: number;
  days: number;
}

export interface StagedTeamCalendarRawRow {
  rowNumber: number;
  resourceName: string;
  matchedResourceId?: Resource['id'];
  rawCells: Record<string, unknown>;
}

export interface TeamCalendarImportStatistics {
  resourceRows: number;
  matchedResourceRows: number;
  unmatchedResourceRows: number;
  decodedCellCount: number;
  unrecognizedMarkingCount: number;
  conflictingMarkingCount: number;
}

export interface TeamCalendarAnalysis {
  fileName: string;
  fileSize: number;
  fileSha256: string;
  sheetName: string;
  monthlyTotals: StagedTeamCalendarMonthTotal[];
  rawRows: StagedTeamCalendarRawRow[];
  anomalies: TeamCalendarAnomaly[];
  statistics: TeamCalendarImportStatistics;
  duplicateOf?: Pick<ImportBatch, 'id' | 'fileName' | 'importedAt' | 'referenceDate'>;
}

export interface AnalyzeTeamCalendarImportRequest {
  fileName: string;
  fileSize: number;
  fileBuffer: ArrayBuffer;
  resources: Pick<Resource, 'id' | 'firstName' | 'lastName' | 'status'>[];
  existingImportBatches: Pick<
    ImportBatch,
    'id' | 'fileName' | 'fileSha256' | 'importedAt' | 'referenceDate' | 'status'
  >[];
}

export interface TeamCalendarCommitResult {
  importBatch: ImportBatch;
  upsertedMonths: number;
  deletedMonths: number;
  affectedResourceCount: number;
  affectedYears: number[];
}
