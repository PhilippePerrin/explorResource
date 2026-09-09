import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ResourceImportAnalysis, ResourceImportWorkerClient } from '@/resourceImport';
import { ResourceImportPage } from '@/features/resource-import';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourceTypesRepository = createRepository('resourceTypes');
const resourcesRepository = createRepository('resources');

function createMockAnalysis(
  overrides: Partial<ResourceImportAnalysis> = {},
): ResourceImportAnalysis {
  return {
    fileName: 'export-resource.xlsx',
    fileSize: 123,
    fileSha256: 'c'.repeat(64),
    sheetName: 'Availability list',
    rawRows: [],
    resourceTypesToCreate: [{ label: 'Commerce - SFDC Developer - EUR', isNew: true }],
    resources: [
      {
        firstName: 'Zakaria',
        lastName: 'IDER',
        resourceTypeLabel: 'Commerce - SFDC Developer - EUR',
        action: 'create',
        rowNumber: 8,
      },
    ],
    noLongerListed: [],
    anomalies: [],
    statistics: {
      totalRows: 3,
      organizationalRows: 0,
      resourceTypeRows: 1,
      personRows: 1,
      detailRows: 1,
      ambiguousRows: 0,
      skippedInactiveCount: 0,
    },
    ...overrides,
  };
}

function createWorkerClient(analysis: ResourceImportAnalysis): ResourceImportWorkerClient {
  return {
    analyzeFile: vi.fn().mockResolvedValue(analysis),
    dispose: vi.fn(),
  };
}

describe('ResourceImportPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('renders the 5-step wizard and history section', async () => {
    render(
      <ResourceImportPage workerClientFactory={() => createWorkerClient(createMockAnalysis())} />,
    );

    expect(await screen.findByRole('heading', { name: /Import resources/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Step /i })).toHaveLength(5);
    expect(screen.getByText(/No resource imports yet\./i)).toBeInTheDocument();
  });

  it('blocks commit when the analysis contains a blocking anomaly', async () => {
    const user = userEvent.setup();
    render(
      <ResourceImportPage
        workerClientFactory={() =>
          createWorkerClient(
            createMockAnalysis({
              anomalies: [
                {
                  id: 'conflicting-1',
                  code: 'conflicting-resource-type',
                  severity: 'blocking',
                  message: 'Conflicting resource type.',
                },
              ],
            }),
          )
        }
      />,
    );

    const fileInput = (await screen.findByLabelText(/Excel workbook/i)) as HTMLInputElement;
    await user.upload(fileInput, new File(['fixture'], 'export-resource.xlsx'));
    await user.click(screen.getByRole('button', { name: /Start technical analysis/i }));
    expect((await screen.findAllByText(/Technical analysis completed/i)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Next step/i }));
    await user.click(screen.getByRole('button', { name: /Next step/i }));

    expect(await screen.findByText(/Blocking anomalies detected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Commit resource import/i })).toBeDisabled();
  });

  it('commits a clean import and creates the staged resource type and resource', async () => {
    const user = userEvent.setup();
    render(
      <ResourceImportPage workerClientFactory={() => createWorkerClient(createMockAnalysis())} />,
    );

    const fileInput = (await screen.findByLabelText(/Excel workbook/i)) as HTMLInputElement;
    await user.upload(fileInput, new File(['fixture'], 'export-resource.xlsx'));
    await user.click(screen.getByRole('button', { name: /Start technical analysis/i }));
    expect((await screen.findAllByText(/Technical analysis completed/i)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Next step/i }));
    await user.click(screen.getByRole('button', { name: /Next step/i }));
    await user.click(screen.getByRole('button', { name: /Commit resource import/i }));

    expect(
      (await screen.findAllByText(/Resource import committed successfully/i)).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: /Download report/i })).toBeInTheDocument();

    const resourceTypes = await resourceTypesRepository.getAll();
    const resources = await resourcesRepository.getAll();
    expect(resourceTypes.map((type) => type.label)).toContain('Commerce - SFDC Developer - EUR');
    expect(
      resources.some(
        (resource) => resource.firstName === 'Zakaria' && resource.lastName === 'IDER',
      ),
    ).toBe(true);
  });
});
