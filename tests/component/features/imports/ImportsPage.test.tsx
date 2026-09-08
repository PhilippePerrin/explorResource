import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ImportAnalysis, ImportWorkerClient } from '@/import';
import { ImportsPage } from '@/features/imports';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourceTypesRepository = createRepository('resourceTypes');
const resourcesRepository = createRepository('resources');
const importBatchesRepository = createRepository('importBatches');
const projectsRepository = createRepository('projects');

function createMockAnalysis(overrides: Partial<ImportAnalysis> = {}): ImportAnalysis {
  return {
    fileName: 'fixture.xlsx',
    fileSize: 123,
    fileSha256: 'b'.repeat(64),
    sheetName: 'DemandWorkload ',
    referenceYear: 2026,
    referenceDate: '2026-01-01',
    monthHeaders: [
      {
        columnIndex: 8,
        columnKey: 'I',
        month: 1,
        year: 2026,
        label: 'JAN 2026',
        cellRef: 'I2',
      },
    ],
    ignoredRowNumbers: [3],
    rawRows: [
      {
        rowNumber: 3,
        classification: 'group',
        classificationConfidence: 0.9,
        anomalyNotes: [],
        rawCells: { A: 'GIS0006 - GCOE' },
      },
      {
        rowNumber: 4,
        classification: 'project',
        classificationConfidence: 0.95,
        anomalyNotes: [],
        rawCells: { A: 'E0100 - Commercial Analytics' },
        parentGroupCode: 'GIS0006',
      },
      {
        rowNumber: 5,
        classification: 'demand',
        classificationConfidence: 0.95,
        anomalyNotes: [],
        rawCells: { C: 'Published', D: 'Commerce - SFDC Developer - EUR' },
        parentGroupCode: 'GIS0006',
        parentProjectCode: 'E0100',
      },
      {
        rowNumber: 6,
        classification: 'supply',
        classificationConfidence: 0.95,
        anomalyNotes: [],
        rawCells: { D: 'Mohamed-Amine BENAMAR' },
        parentGroupCode: 'GIS0006',
        parentProjectCode: 'E0100',
      },
    ],
    groups: [{ code: 'GIS0006', label: 'GCOE' }],
    projects: [{ code: 'E0100', name: 'Commercial Analytics', parentGroupCode: 'GIS0006' }],
    demandSnapshots: [
      {
        projectCode: 'E0100',
        resourceTypeLabel: 'Commerce - SFDC Developer - EUR',
        resourceTypeId: '2b973647-498d-4c42-8d90-71f668f30c2e',
        year: 2026,
        month: 1,
        demandDays: 4,
        supplyDays: 1,
        origin: 'import',
        rowNumber: 5,
        cellRef: 'I5',
        activity: 'Commercial Analytics',
        parentGroupCode: 'GIS0006',
        source: 'comment',
      },
    ],
    allocations: [
      {
        resourceName: 'Mohamed-Amine BENAMAR',
        resourceId: 'f7419cc4-15cc-41a9-a28e-86f421dca915',
        projectCode: 'E0100',
        resourceTypeLabel: 'Commerce - SFDC Developer - EUR',
        resourceTypeId: '2b973647-498d-4c42-8d90-71f668f30c2e',
        year: 2026,
        month: 1,
        allocatedDays: 1,
        origin: 'import',
        rowNumber: 6,
        cellRef: 'I6',
        activity: 'Commercial Analytics',
      },
    ],
    anomalies: [],
    statistics: {
      totalRows: 4,
      groupRows: 1,
      projectRows: 1,
      demandRows: 1,
      supplyRows: 1,
      ambiguousRows: 0,
      ignoredRows: 0,
      demandSnapshotCount: 1,
      allocationCount: 1,
    },
    ...overrides,
  };
}

function createWorkerClient(analysis: ImportAnalysis): ImportWorkerClient {
  return {
    analyzeFile: vi.fn().mockResolvedValue(analysis),
    dispose: vi.fn(),
  };
}

describe('ImportsPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
    await resourceTypesRepository.put({
      id: '2b973647-498d-4c42-8d90-71f668f30c2e',
      label: 'Commerce - SFDC Developer - EUR',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourcesRepository.put({
      id: 'f7419cc4-15cc-41a9-a28e-86f421dca915',
      firstName: 'Mohamed-Amine',
      lastName: 'BENAMAR',
      resourceTypeId: '2b973647-498d-4c42-8d90-71f668f30c2e',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
  });

  it('renders the 10-step wizard and import history section', async () => {
    render(<ImportsPage workerClientFactory={() => createWorkerClient(createMockAnalysis())} />);

    expect(await screen.findByRole('heading', { name: /^Imports$/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Step /i })).toHaveLength(10);
    expect(screen.getByText(/No validated imports yet\./i)).toBeInTheDocument();
  });

  it('blocks commit when the analysis contains blocking anomalies', async () => {
    const user = userEvent.setup();
    render(
      <ImportsPage
        workerClientFactory={() =>
          createWorkerClient(
            createMockAnalysis({
              anomalies: [
                {
                  id: 'blocking-1',
                  code: 'unknown-resource',
                  severity: 'blocking',
                  message: 'Unknown resource "Missing Person".',
                  rowNumber: 6,
                },
              ],
            }),
          )
        }
      />,
    );

    const fileInput = (await screen.findByLabelText(/Excel workbook/i)) as HTMLInputElement;
    await user.upload(fileInput, new File(['fixture'], 'fixture.xlsx'));
    await user.click(screen.getByRole('button', { name: /Start technical analysis/i }));
    expect(await screen.findByText(/Technical analysis completed/i)).toBeInTheDocument();

    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByRole('button', { name: /Next step/i }));
    }

    expect(await screen.findByText(/Blocking anomalies detected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Commit atomic import/i })).toBeDisabled();
  });

  it('commits a clean import and appends it to the history', async () => {
    const user = userEvent.setup();
    render(<ImportsPage workerClientFactory={() => createWorkerClient(createMockAnalysis())} />);

    const fileInput = (await screen.findByLabelText(/Excel workbook/i)) as HTMLInputElement;
    await user.upload(fileInput, new File(['fixture'], 'fixture.xlsx'));
    await user.click(screen.getByRole('button', { name: /Start technical analysis/i }));
    expect(await screen.findByText(/Technical analysis completed/i)).toBeInTheDocument();

    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByRole('button', { name: /Next step/i }));
    }

    await user.click(screen.getByRole('button', { name: /Commit atomic import/i }));

    expect(await screen.findByText(/Import committed successfully/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Download report/i })).toBeInTheDocument();

    await waitFor(async () => {
      const batches = await importBatchesRepository.getAll();
      const projects = await projectsRepository.getAll();

      expect(batches).toHaveLength(1);
      expect(projects[0]?.code).toBe('E0100');
    });

    expect(screen.getByText('fixture.xlsx')).toBeInTheDocument();
  });
});
