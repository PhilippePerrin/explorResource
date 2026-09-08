import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AllocationStudioPage } from '@/features/allocation-studio';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const projectsRepository = createRepository('projects');
const workingDaysRepository = createRepository('workingDaysCalendars');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const allocationsRepository = createRepository('allocations');

describe('AllocationStudioPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('supports the keyboard alternative, simulation before commit, and undo/redo', async () => {
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
    await resourcesRepository.put({
      id: '11111111-1111-1111-1111-111111111111',
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await projectsRepository.put({
      id: '22222222-2222-2222-2222-222222222222',
      code: 'E0100',
      name: 'Commercial Analytics',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await workingDaysRepository.put({
      id: '33333333-3333-3333-3333-333333333333',
      year: 2026,
      month: 1,
      workingDaysCount: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await demandSnapshotsRepository.put({
      id: '44444444-4444-4444-4444-444444444444',
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

    const user = userEvent.setup();
    render(<AllocationStudioPage />);

    await screen.findByRole('heading', { name: /^Allocation Studio$/i });
    const keyboardSection = screen
      .getByRole('heading', { name: /Keyboard allocation form/i })
      .closest('section');

    expect(keyboardSection).not.toBeNull();
    expect(
      await within(keyboardSection as HTMLElement).findByText('Alice Martin'),
    ).toBeInTheDocument();

    await user.selectOptions(
      within(keyboardSection as HTMLElement).getByLabelText(/^Resource$/i),
      '11111111-1111-1111-1111-111111111111',
    );
    await user.selectOptions(
      within(keyboardSection as HTMLElement).getByLabelText(/Target project/i),
      'E0100',
    );
    await user.selectOptions(
      within(keyboardSection as HTMLElement).getByLabelText(/^Resource type$/i),
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
    await user.selectOptions(
      within(keyboardSection as HTMLElement).getByLabelText(/^Month$/i),
      '1',
    );
    await user.clear(within(keyboardSection as HTMLElement).getByLabelText(/^Days$/i));
    await user.type(within(keyboardSection as HTMLElement).getByLabelText(/^Days$/i), '6');

    await user.click(
      within(keyboardSection as HTMLElement).getByRole('button', { name: /Simulate change/i }),
    );
    expect(await screen.findByText(/Demand coverage after change/i)).toBeInTheDocument();
    expect(await screen.findByText(/Over-service after: 1 d/i)).toBeInTheDocument();
    expect(await screen.findByText(/Over-served/i)).toBeInTheDocument();
    expect(screen.getAllByText('↗').length).toBeGreaterThan(0);
    expect(await allocationsRepository.getAll()).toHaveLength(0);

    await user.click(
      within(keyboardSection as HTMLElement).getByRole('button', { name: /Queue change/i }),
    );
    expect((await screen.findAllByText(/Draft allocation queued/i)).length).toBeGreaterThan(0);
    expect(await allocationsRepository.getAll()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /^Undo$/i }));
    expect(screen.getByRole('button', { name: /^Redo$/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /^Redo$/i }));
    await user.click(screen.getByRole('button', { name: /Save draft/i }));

    await waitFor(async () => {
      const allocations = await allocationsRepository.getAll();
      expect(allocations).toHaveLength(1);
      expect(allocations[0]?.allocatedDays).toBe(6);
    });
  });
});
