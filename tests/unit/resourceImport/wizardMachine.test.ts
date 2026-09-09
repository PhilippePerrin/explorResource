import { describe, expect, it } from 'vitest';

import {
  hasBlockingAnomalies,
  initialResourceImportWizardState,
  resourceImportWizardReducer,
  type ResourceImportAnalysis,
} from '@/resourceImport';

function buildAnalysis(overrides: Partial<ResourceImportAnalysis> = {}): ResourceImportAnalysis {
  return {
    fileName: 'export-resource.xlsx',
    fileSize: 123,
    fileSha256: 'a'.repeat(64),
    sheetName: 'Availability list',
    rawRows: [],
    resourceTypesToCreate: [],
    resources: [],
    noLongerListed: [],
    anomalies: [],
    statistics: {
      totalRows: 0,
      organizationalRows: 0,
      resourceTypeRows: 0,
      personRows: 0,
      detailRows: 0,
      ambiguousRows: 0,
      skippedInactiveCount: 0,
    },
    ...overrides,
  };
}

describe('resourceImportWizardReducer', () => {
  it('advances to preview after a successful analysis', () => {
    const withFile = resourceImportWizardReducer(initialResourceImportWizardState, {
      type: 'select-file',
      fileName: 'export-resource.xlsx',
      fileSize: 123,
    });

    const succeeded = resourceImportWizardReducer(withFile, {
      type: 'analysis-succeeded',
      analysis: buildAnalysis(),
    });

    expect(succeeded.currentStepId).toBe('preview');
    expect(succeeded.status).toBe('analysis-ready');
  });

  it('reports blocking anomalies through hasBlockingAnomalies', () => {
    const succeeded = resourceImportWizardReducer(initialResourceImportWizardState, {
      type: 'analysis-succeeded',
      analysis: buildAnalysis({
        anomalies: [
          {
            id: 'duplicate-file:n/a:msg',
            code: 'duplicate-file',
            severity: 'blocking',
            message: 'This file matches an already imported batch.',
          },
        ],
      }),
    });

    expect(hasBlockingAnomalies(succeeded)).toBe(true);
  });

  it('moves to the final-report step and stops going further back after a successful commit', () => {
    const succeeded = resourceImportWizardReducer(initialResourceImportWizardState, {
      type: 'analysis-succeeded',
      analysis: buildAnalysis(),
    });
    const committed = resourceImportWizardReducer(succeeded, {
      type: 'commit-succeeded',
      commitResult: {
        importBatch: {
          id: 'batch-1',
          importedAt: '2026-09-08T10:00:00.000Z',
          referenceDate: '2026-09-08',
          fileName: 'export-resource.xlsx',
          fileSha256: 'a'.repeat(64),
          rowCount: 0,
          status: 'validated',
          kind: 'resource',
          createdAt: '2026-09-08T10:00:00.000Z',
          updatedAt: '2026-09-08T10:00:00.000Z',
        },
        createdResourceTypes: 0,
        createdResources: 0,
        updatedResources: 0,
        unchangedResources: 0,
        skippedTypeChanges: [],
      },
      reportMarkdown: '# Resource import report',
    });

    expect(committed.currentStepId).toBe('final-report');
    expect(committed.status).toBe('completed');
  });
});
