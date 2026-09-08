import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DemandCoverageBoardPage } from '@/features/demand-coverage';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const projectsRepository = createRepository('projects');
const resourceTypesRepository = createRepository('resourceTypes');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const allocationsRepository = createRepository('allocations');

describe('DemandCoverageBoardPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('shows covered demand, uncovered demand, and over-service separately', async () => {
    await projectsRepository.put({
      id: '11111111-1111-1111-1111-111111111111',
      code: 'E0100',
      name: 'Commercial Analytics',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await resourceTypesRepository.put({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      label: 'Developer',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await demandSnapshotsRepository.put({
      id: '22222222-2222-2222-2222-222222222222',
      importBatchId: 'manual',
      projectCode: 'E0100',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      year: 2026,
      month: 1,
      demandDays: 5,
      supplyDays: 0,
      origin: 'manual-adjustment',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await allocationsRepository.put({
      id: '33333333-3333-3333-3333-333333333333',
      resourceId: '44444444-4444-4444-4444-444444444444',
      projectCode: 'E0100',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      year: 2026,
      month: 1,
      allocatedDays: 6,
      origin: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    render(<DemandCoverageBoardPage />);

    expect(
      await screen.findByRole('heading', { name: /^Demand Coverage Board$/i }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText(/Demand 5 d/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Covered 6 d/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Gap 0 d/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Over-service 1 d/i)).length).toBeGreaterThan(0);
  });
});
