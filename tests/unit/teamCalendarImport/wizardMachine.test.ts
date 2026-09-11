import { describe, expect, it } from 'vitest';

import {
  hasBlockingAnomalies,
  initialTeamCalendarImportWizardState,
  teamCalendarImportWizardReducer,
  type TeamCalendarAnalysis,
} from '@/teamCalendarImport';

function buildAnalysis(overrides: Partial<TeamCalendarAnalysis> = {}): TeamCalendarAnalysis {
  return {
    fileName: 'Team Calendar.xlsx',
    fileSize: 123,
    fileSha256: 'a'.repeat(64),
    sheetName: 'Presence',
    monthlyTotals: [],
    rawRows: [],
    anomalies: [],
    statistics: {
      resourceRows: 0,
      matchedResourceRows: 0,
      unmatchedResourceRows: 0,
      decodedCellCount: 0,
      unrecognizedMarkingCount: 0,
      conflictingMarkingCount: 0,
    },
    ...overrides,
  };
}

describe('teamCalendarImportWizardReducer', () => {
  it('advances to preview after a successful analysis', () => {
    const withFile = teamCalendarImportWizardReducer(initialTeamCalendarImportWizardState, {
      type: 'select-file',
      fileName: 'Team Calendar.xlsx',
      fileSize: 123,
    });

    const succeeded = teamCalendarImportWizardReducer(withFile, {
      type: 'analysis-succeeded',
      analysis: buildAnalysis(),
    });

    expect(succeeded.currentStepId).toBe('preview');
    expect(succeeded.status).toBe('analysis-ready');
  });

  it('reports blocking anomalies through hasBlockingAnomalies', () => {
    const succeeded = teamCalendarImportWizardReducer(initialTeamCalendarImportWizardState, {
      type: 'analysis-succeeded',
      analysis: buildAnalysis({
        anomalies: [
          {
            id: 'unknown-resource:12:msg',
            code: 'unknown-resource',
            severity: 'blocking',
            message: '"Jane Doe" does not match any active resource by name.',
          },
        ],
      }),
    });

    expect(hasBlockingAnomalies(succeeded)).toBe(true);
  });

  it('moves to the final-report step and stops going further back after a successful commit', () => {
    const succeeded = teamCalendarImportWizardReducer(initialTeamCalendarImportWizardState, {
      type: 'analysis-succeeded',
      analysis: buildAnalysis(),
    });
    const committed = teamCalendarImportWizardReducer(succeeded, {
      type: 'commit-succeeded',
      commitResult: {
        importBatch: {
          id: 'batch-1',
          importedAt: '2026-09-08T10:00:00.000Z',
          referenceDate: '2026-09-08',
          fileName: 'Team Calendar.xlsx',
          fileSha256: 'a'.repeat(64),
          rowCount: 0,
          status: 'validated',
          kind: 'non-working-days',
          createdAt: '2026-09-08T10:00:00.000Z',
          updatedAt: '2026-09-08T10:00:00.000Z',
        },
        upsertedMonths: 0,
        deletedMonths: 0,
        affectedResourceCount: 0,
        affectedYears: [],
      },
      reportMarkdown: '# Team Calendar (non-working days) import report',
    });

    expect(committed.currentStepId).toBe('final-report');
    expect(committed.status).toBe('completed');
  });
});
