import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { AllocationStudioPage } from '@/features/allocation-studio';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AllocationStudioPage />
    </MemoryRouter>,
  );
}

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const projectsRepository = createRepository('projects');
const workingDaysRepository = createRepository('workingDaysCalendars');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const allocationsRepository = createRepository('allocations');

async function seedBaseFixtures() {
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
}

describe('AllocationStudioPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('supports the non-drag "Add allocation" flow with simulation before commit, and undo/redo', async () => {
    await seedBaseFixtures();

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /^Allocation Studio$/i });
    await screen.findByText('Alice Martin');

    await user.click(screen.getByRole('button', { name: /Add allocation…/i }));
    const drawer = screen.getByRole('dialog', { name: /Add allocation/i });

    await user.selectOptions(
      within(drawer).getByLabelText(/^Resource$/i),
      '11111111-1111-1111-1111-111111111111',
    );
    await user.selectOptions(within(drawer).getByLabelText(/Target project/i), 'E0100');
    await user.selectOptions(
      within(drawer).getByLabelText(/^Resource type$/i),
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
    await user.selectOptions(within(drawer).getByLabelText(/^Month$/i), '1');
    await user.clear(within(drawer).getByLabelText(/^Days$/i));
    await user.type(within(drawer).getByLabelText(/^Days$/i), '6');

    await user.click(within(drawer).getByRole('button', { name: /Simulate change/i }));
    expect(await within(drawer).findByText(/Demand coverage after change/i)).toBeInTheDocument();
    expect(await within(drawer).findByText(/Over-service after: 1 d/i)).toBeInTheDocument();
    expect(await allocationsRepository.getAll()).toHaveLength(0);

    await user.click(within(drawer).getByRole('button', { name: /Queue change/i }));
    expect((await screen.findAllByText(/Draft allocation queued/i)).length).toBeGreaterThan(0);
    expect(await allocationsRepository.getAll()).toHaveLength(0);
    expect(screen.queryByRole('dialog', { name: /Add allocation/i })).not.toBeInTheDocument();

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

  it('lets keyboard users arm a resource card and activate a board cell to add it across every visible month', async () => {
    await seedBaseFixtures();

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /^Allocation Studio$/i });

    const benchCard = screen.getByRole('button', { name: /Alice Martin/i, pressed: false });
    await user.click(benchCard);
    expect(
      screen.getByRole('button', { name: /Alice Martin/i, pressed: true }),
    ).toBeInTheDocument();

    const cellButton = await screen.findByRole('button', {
      name: /E0100 Commercial Analytics, month January\. .*Press Enter or Space to open quick-assign\./i,
    });
    cellButton.focus();
    await user.keyboard('{Enter}');

    const panel = await screen.findByRole('dialog', { name: /Add across all visible months/i });
    // Focus month (January) has a 5-day demand gap; every other visible
    // month has neither demand nor an existing allocation, so it defaults to
    // the fallback 1-day proposal (Rule A: same batch regardless of which
    // month cell was the physical target).
    const januaryRow = within(panel).getByText('January').closest('tr');
    const februaryRow = within(panel).getByText('February').closest('tr');
    const decemberRow = within(panel).getByText('December').closest('tr');
    expect(januaryRow).not.toBeNull();
    expect(februaryRow).not.toBeNull();
    expect(decemberRow).not.toBeNull();
    expect(within(januaryRow as HTMLElement).getByText('5 d')).toBeInTheDocument();
    expect(within(februaryRow as HTMLElement).getByText('1 d')).toBeInTheDocument();
    expect(within(decemberRow as HTMLElement).getByText('1 d')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: /Queue change/i }));
    expect(
      (await screen.findAllByText(/Draft allocations queued for 12 month\(s\)/i)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('dialog', { name: /Add across all visible months/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Alice Martin/i, pressed: false }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save draft/i }));

    await waitFor(async () => {
      const allocations = await allocationsRepository.getAll();
      expect(allocations).toHaveLength(12);
      expect(allocations.every((allocation) => allocation.origin === 'drag-and-drop')).toBe(true);
      expect(allocations.find((allocation) => allocation.month === 1)?.allocatedDays).toBe(5);
      expect(allocations.find((allocation) => allocation.month === 2)?.allocatedDays).toBe(1);
    });
  });

  it('reverts every month from a multi-month add in a single Undo step', async () => {
    await seedBaseFixtures();

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /^Allocation Studio$/i });
    await user.click(screen.getByRole('button', { name: /Alice Martin/i, pressed: false }));

    const addAcrossButton = await screen.findByRole('button', {
      name: /Add across all visible months/i,
    });
    await user.click(addAcrossButton);

    const panel = await screen.findByRole('dialog', { name: /Add across all visible months/i });
    await user.click(within(panel).getByRole('button', { name: /Queue change/i }));
    expect(
      (await screen.findAllByText(/Draft allocations queued for 12 month\(s\)/i)).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /^Undo$/i }));
    await user.click(screen.getByRole('button', { name: /Save draft/i }));

    await waitFor(async () => {
      expect(await allocationsRepository.getAll()).toHaveLength(0);
    });
  });

  it('disables the row-level multi-month activator until a resource is armed', async () => {
    await seedBaseFixtures();
    renderPage();

    await screen.findByRole('heading', { name: /^Allocation Studio$/i });

    const addAcrossButton = await screen.findByRole('button', {
      name: /Add across all visible months/i,
    });
    expect(addAcrossButton).toBeDisabled();
  });

  it('still opens single-month quick-assign when editing an existing assignment cell', async () => {
    await seedBaseFixtures();
    await allocationsRepository.put({
      id: '99999999-9999-9999-9999-999999999999',
      resourceId: '11111111-1111-1111-1111-111111111111',
      projectCode: 'E0100',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      year: 2026,
      month: 1,
      allocatedDays: 3,
      origin: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: /^Allocation Studio$/i });

    const assignmentCell = await screen.findByRole('button', {
      name: /Alice Martin in E0100, month January: 3 d/i,
    });
    await user.click(assignmentCell);

    const drawer = await screen.findByRole('dialog', { name: /Add allocation/i });
    expect(within(drawer).getByLabelText(/^Resource$/i)).toHaveValue(
      '11111111-1111-1111-1111-111111111111',
    );
    expect(within(drawer).getByLabelText(/^Days$/i)).toHaveValue(3);
    expect(within(drawer).getByLabelText(/^Change mode$/i)).toHaveValue('set');

    await user.clear(within(drawer).getByLabelText(/^Days$/i));
    await user.type(within(drawer).getByLabelText(/^Days$/i), '4');
    await user.click(within(drawer).getByRole('button', { name: /Queue change/i }));
    await user.click(screen.getByRole('button', { name: /Save draft/i }));

    await waitFor(async () => {
      const allocations = await allocationsRepository.getAll();
      expect(allocations).toHaveLength(1);
      expect(allocations[0]?.allocatedDays).toBe(4);
      expect(allocations[0]?.month).toBe(1);
    });
  });

  it('renders the new summary columns and one row per demand-line plus assignment', async () => {
    await seedBaseFixtures();
    await allocationsRepository.put({
      id: '99999999-9999-9999-9999-999999999999',
      resourceId: '11111111-1111-1111-1111-111111111111',
      projectCode: 'E0100',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      year: 2026,
      month: 1,
      allocatedDays: 3,
      origin: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    renderPage();

    await screen.findByRole('heading', { name: /^Allocation Studio$/i });

    const table = await screen.findByRole('table', { name: /Allocation board/i });

    for (const columnName of ['Status', 'Resource', 'Activity', 'Total supply', 'Total demand']) {
      expect(within(table).getByRole('columnheader', { name: columnName })).toBeInTheDocument();
    }

    expect(within(table).getByText('Manual')).toBeInTheDocument();
    expect(within(table).getAllByText('Commercial Analytics').length).toBeGreaterThan(0);

    const assignmentNameCell = within(table).getByText('Alice Martin');
    const assignmentRow = assignmentNameCell.closest('tr');
    expect(assignmentRow).not.toBeNull();
    expect(
      within(assignmentRow as HTMLElement).getByRole('button', {
        name: /Alice Martin in E0100, month January: 3 d/i,
      }),
    ).toBeInTheDocument();
  });
});
