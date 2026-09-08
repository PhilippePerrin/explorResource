import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { DemandCoverageBoardPage } from '@/features/demand-coverage';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const projectsRepository = createRepository('projects');
const resourceTypesRepository = createRepository('resourceTypes');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const allocationsRepository = createRepository('allocations');

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <DemandCoverageBoardPage />
    </MemoryRouter>,
  );
}

describe('DemandCoverageBoardPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
    window.localStorage.clear();
  });

  it('shows coverage badges, filters rows, and restores favorites', async () => {
    await projectsRepository.put({
      id: '11111111-1111-1111-1111-111111111111',
      code: 'E0100',
      name: 'Commercial Analytics',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await projectsRepository.put({
      id: '55555555-5555-5555-5555-555555555555',
      code: 'E0200',
      name: 'Supply Chain',
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
    await demandSnapshotsRepository.put({
      id: '55555555-2222-2222-2222-222222222222',
      importBatchId: 'manual',
      projectCode: 'E0200',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      year: 2026,
      month: 1,
      demandDays: 4,
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
    await allocationsRepository.put({
      id: '66666666-6666-6666-6666-666666666666',
      resourceId: '77777777-7777-7777-7777-777777777777',
      projectCode: 'E0200',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      year: 2026,
      month: 1,
      allocatedDays: 2,
      origin: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /^Demand Coverage Board$/i }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText(/Demand 5 d/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Covered 6 d/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Gap 0 d/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Over-service 1 d/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('↗').length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/^Uncovered$/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('⚠').length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(/Project search/i), 'E0200');
    await waitFor(() => {
      expect(screen.getByText('E0200')).toBeInTheDocument();
      expect(screen.queryByText('E0100')).not.toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Save current filters as favorite/i), 'Supply gap');
    await user.click(screen.getByRole('button', { name: /Save favorite/i }));
    await user.clear(screen.getByLabelText(/Project search/i));
    await user.type(screen.getByLabelText(/Project search/i), 'E0100');
    await waitFor(() => {
      expect(screen.getByText('E0100')).toBeInTheDocument();
      expect(screen.queryByText('E0200')).not.toBeInTheDocument();
    });

    await user.selectOptions(
      screen.getByLabelText(/Saved favorites/i),
      screen.getByRole('option', { name: 'Supply gap' }),
    );
    await user.click(screen.getByRole('button', { name: /Apply favorite/i }));
    await waitFor(() => {
      expect(screen.getByText('E0200')).toBeInTheDocument();
      expect(screen.queryByText('E0100')).not.toBeInTheDocument();
    });
  });
});
