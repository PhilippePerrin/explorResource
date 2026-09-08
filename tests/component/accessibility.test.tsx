import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    transform: null,
  }),
  useDroppable: () => ({
    isOver: false,
    setNodeRef: () => undefined,
  }),
}));

import { AllocationStudioPage } from '@/features/allocation-studio';
import { DashboardPage } from '@/features/dashboard';
import { ResourcesPage } from '@/features/resources';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

vi.mock('recharts', () => ({
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const resourcesRepository = createRepository('resources');
const allocationsRepository = createRepository('allocations');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const workingDaysRepository = createRepository('workingDaysCalendars');
const resourceTypesRepository = createRepository('resourceTypes');
const companiesRepository = createRepository('companies');
const projectsRepository = createRepository('projects');

async function expectNoAxeViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
    },
  });

  expect(results.violations).toEqual([]);
}

describe('accessibility smoke tests', () => {
  beforeEach(async () => {
    await deletePlannerDb();
    window.localStorage.clear();
  });

  it('has no obvious axe violations on the dashboard', async () => {
    await resourcesRepository.put({
      id: '11111111-1111-4111-8111-111111111111',
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await workingDaysRepository.put({
      id: '22222222-2222-4222-8222-222222222222',
      year: 2026,
      month: 9,
      workingDaysCount: 20,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await allocationsRepository.put({
      id: '33333333-3333-4333-8333-333333333333',
      resourceId: '11111111-1111-4111-8111-111111111111',
      projectCode: 'E0100',
      resourceTypeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      year: 2026,
      month: 9,
      allocatedDays: 15,
      origin: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await demandSnapshotsRepository.put({
      id: '44444444-4444-4444-8444-444444444444',
      importBatchId: 'manual',
      projectCode: 'E0100',
      resourceTypeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      year: 2026,
      month: 9,
      demandDays: 18,
      supplyDays: 0,
      origin: 'manual-adjustment',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { container } = render(<DashboardPage />);
    await screen.findByRole('heading', { name: /^Dashboard$/i });

    await expectNoAxeViolations(container);
  });

  it('has no obvious axe violations on the resources page', async () => {
    await resourceTypesRepository.put({
      id: '55555555-5555-4555-8555-555555555555',
      label: 'Developer',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await companiesRepository.put({
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Acme Partners',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { container } = render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <ResourcesPage />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: /^Resources$/i });
    await waitFor(() => {
      expect(screen.queryByText(/Loading resources/i)).not.toBeInTheDocument();
    });

    await expectNoAxeViolations(container);
  });

  it('has no obvious axe violations on the allocation studio keyboard path', async () => {
    await resourceTypesRepository.put({
      id: '77777777-7777-4777-8777-777777777777',
      label: 'Developer',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await resourcesRepository.put({
      id: '88888888-8888-4888-8888-888888888888',
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: '77777777-7777-4777-8777-777777777777',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await projectsRepository.put({
      id: '99999999-9999-4999-8999-999999999999',
      code: 'E0100',
      name: 'Commercial Analytics',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await workingDaysRepository.put({
      id: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaabbbb',
      year: 2026,
      month: 1,
      workingDaysCount: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await demandSnapshotsRepository.put({
      id: 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb',
      importBatchId: 'manual',
      projectCode: 'E0100',
      resourceTypeId: '77777777-7777-4777-8777-777777777777',
      year: 2026,
      month: 1,
      demandDays: 5,
      supplyDays: 0,
      origin: 'manual-adjustment',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const { container } = render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AllocationStudioPage />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: /^Allocation Studio$/i });
    expect((await screen.findAllByText('Alice Martin')).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.queryByText(/Loading allocation board/i)).not.toBeInTheDocument();
    });

    await expectNoAxeViolations(container);
  });
});
