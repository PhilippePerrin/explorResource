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
const demandSnapshotsRepository = createRepository('demandSnapshots');
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
    expect(screen.getByText(/No imports yet\./i)).toBeInTheDocument();
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
    expect((await screen.findAllByText(/Technical analysis completed/i)).length).toBeGreaterThan(0);

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
    expect((await screen.findAllByText(/Technical analysis completed/i)).length).toBeGreaterThan(0);

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

  it('renders aggregate comparison indicators and restores demand from the reference import', async () => {
    const user = userEvent.setup();

    await importBatchesRepository.put({
      id: '11111111-1111-4111-8111-111111111111',
      importedAt: '2026-09-07T10:00:00.000Z',
      referenceDate: '2026-09-01',
      note: 'Older import',
      fileName: 'older.xlsx',
      fileSha256: '1'.repeat(64),
      rowCount: 10,
      status: 'validated',
      kind: 'demand',
      createdAt: '2026-09-07T10:00:00.000Z',
      updatedAt: '2026-09-07T10:00:00.000Z',
    });
    await importBatchesRepository.put({
      id: '22222222-2222-4222-8222-222222222222',
      importedAt: '2026-09-08T10:00:00.000Z',
      referenceDate: '2026-09-08',
      note: 'Latest import',
      fileName: 'latest.xlsx',
      fileSha256: '2'.repeat(64),
      rowCount: 12,
      status: 'validated',
      kind: 'demand',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const snapshots = [
      {
        id: 'a1fd409c-b960-4a71-8872-5a46b8011111',
        importBatchId: '11111111-1111-4111-8111-111111111111',
        projectCode: 'E0100',
        resourceTypeId: '2b973647-498d-4c42-8d90-71f668f30c2e',
        year: 2026,
        month: 1,
        demandDays: 4,
        supplyDays: 0,
        origin: 'import' as const,
        createdAt: '2026-09-07T10:00:00.000Z',
        updatedAt: '2026-09-07T10:00:00.000Z',
      },
      {
        id: 'a1fd409c-b960-4a71-8872-5a46b8011112',
        importBatchId: '11111111-1111-4111-8111-111111111111',
        projectCode: 'E0100',
        resourceTypeId: '8cbef9bd-b82f-4825-a912-71f668f30c2f',
        year: 2026,
        month: 1,
        demandDays: 1,
        supplyDays: 0,
        origin: 'import' as const,
        createdAt: '2026-09-07T10:00:00.000Z',
        updatedAt: '2026-09-07T10:00:00.000Z',
      },
      {
        id: 'a1fd409c-b960-4a71-8872-5a46b8011113',
        importBatchId: '11111111-1111-4111-8111-111111111111',
        projectCode: 'E0300',
        resourceTypeId: '2b973647-498d-4c42-8d90-71f668f30c2e',
        year: 2026,
        month: 1,
        demandDays: 2,
        supplyDays: 0,
        origin: 'import' as const,
        createdAt: '2026-09-07T10:00:00.000Z',
        updatedAt: '2026-09-07T10:00:00.000Z',
      },
      {
        id: 'a1fd409c-b960-4a71-8872-5a46b8012221',
        importBatchId: '22222222-2222-4222-8222-222222222222',
        projectCode: 'E0100',
        resourceTypeId: '2b973647-498d-4c42-8d90-71f668f30c2e',
        year: 2026,
        month: 1,
        demandDays: 6,
        supplyDays: 0,
        origin: 'import' as const,
        createdAt: '2026-09-08T10:00:00.000Z',
        updatedAt: '2026-09-08T10:00:00.000Z',
      },
      {
        id: 'a1fd409c-b960-4a71-8872-5a46b8012222',
        importBatchId: '22222222-2222-4222-8222-222222222222',
        projectCode: 'E0200',
        resourceTypeId: '2b973647-498d-4c42-8d90-71f668f30c2e',
        year: 2026,
        month: 1,
        demandDays: 1.5,
        supplyDays: 0,
        origin: 'import' as const,
        createdAt: '2026-09-08T10:00:00.000Z',
        updatedAt: '2026-09-08T10:00:00.000Z',
      },
    ];

    await resourceTypesRepository.put({
      id: '8cbef9bd-b82f-4825-a912-71f668f30c2f',
      label: 'Commerce - QA - EUR',
      shortCode: 'QA',
      color: '#00427f',
      status: 'active',
      displayOrder: 2,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    for (const snapshot of snapshots) {
      await demandSnapshotsRepository.put(snapshot);
    }

    render(<ImportsPage workerClientFactory={() => createWorkerClient(createMockAnalysis())} />);

    expect(await screen.findByText('older.xlsx')).toBeInTheDocument();
    expect(screen.getByText('latest.xlsx')).toBeInTheDocument();
    expect(screen.getByText(/Department positive/i)).toBeInTheDocument();
    expect(screen.getByText(/Department negative/i)).toBeInTheDocument();
    expect(screen.getByText(/Department net/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\+3\.5/).length).toBeGreaterThan(0);
    expect(screen.getByText(/✨ New project/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Restore current demand from reference import/i }),
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/nothing is deleted/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Restore demand/i }));

    expect((await screen.findAllByText(/history was preserved/i)).length).toBeGreaterThan(0);

    await waitFor(async () => {
      const storedSnapshots = await demandSnapshotsRepository.getAll();
      const manualSnapshots = storedSnapshots.filter(
        (snapshot) => snapshot.importBatchId === 'manual',
      );

      expect(manualSnapshots).toHaveLength(2);
      expect(manualSnapshots.every((snapshot) => snapshot.origin === 'manual-adjustment')).toBe(
        true,
      );
    });
  });
});
