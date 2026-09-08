import { describe, expect, it } from 'vitest';

import {
  buildImportComparisonSummary,
  importWizardReducer,
  initialImportWizardState,
  type ImportAnalysis,
} from '@/import';

const analysis: ImportAnalysis = {
  fileName: 'fixture.xlsx',
  fileSize: 123,
  fileSha256: 'a'.repeat(64),
  sheetName: 'DemandWorkload',
  referenceYear: 2026,
  referenceDate: '2026-01-01',
  monthHeaders: [],
  ignoredRowNumbers: [],
  rawRows: [],
  groups: [],
  projects: [],
  demandSnapshots: [],
  allocations: [],
  anomalies: [],
  statistics: {
    totalRows: 0,
    groupRows: 0,
    projectRows: 0,
    demandRows: 0,
    supplyRows: 0,
    ambiguousRows: 0,
    ignoredRows: 0,
    demandSnapshotCount: 0,
    allocationCount: 0,
  },
};

describe('importWizardReducer', () => {
  it('advances to preview after a successful analysis', () => {
    const withFile = importWizardReducer(initialImportWizardState, {
      type: 'select-file',
      fileName: 'fixture.xlsx',
      fileSize: 123,
    });

    const succeeded = importWizardReducer(withFile, {
      type: 'analysis-succeeded',
      analysis,
      comparison: buildImportComparisonSummary({
        analysis,
        previousBatch: null,
        previousDemandSnapshots: [],
        resourceTypeLabelsById: new Map(),
      }),
    });

    expect(succeeded.currentStepId).toBe('preview');
    expect(succeeded.furthestStepIndex).toBeGreaterThanOrEqual(2);
  });
});
