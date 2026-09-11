import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DashboardPage } from '@/features/dashboard';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const allocationsRepository = createRepository('allocations');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const workingDaysRepository = createRepository('workingDaysCalendars');

interface MonthDatum {
  netCapacityDays: number;
}

vi.mock('recharts', () => ({
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  LineChart: ({ children, data }: { children: ReactNode; data: MonthDatum[] }) => (
    <div
      data-testid="dashboard-trend-total-capacity"
      data-total-net-capacity={data.reduce((sum, month) => sum + month.netCapacityDays, 0)}
    >
      {children}
    </div>
  ),
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe('DashboardPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('shows overload alerts and renders the trend chart', async () => {
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
    await workingDaysRepository.put({
      id: '22222222-2222-2222-2222-222222222222',
      year: 2026,
      month: 9,
      workingDaysCount: 20,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await allocationsRepository.put({
      id: '33333333-3333-3333-3333-333333333333',
      resourceId: '11111111-1111-1111-1111-111111111111',
      projectCode: 'E0100',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      year: 2026,
      month: 9,
      allocatedDays: 25,
      origin: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await demandSnapshotsRepository.put({
      id: '44444444-4444-4444-4444-444444444444',
      importBatchId: 'manual',
      projectCode: 'E0100',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      year: 2026,
      month: 9,
      demandDays: 30,
      supplyDays: 0,
      origin: 'manual-adjustment',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    render(<DashboardPage />);

    expect(await screen.findByRole('heading', { name: /^Dashboard$/i })).toBeInTheDocument();
    expect(await screen.findByText(/Overloaded resources need review/i)).toBeInTheDocument();
    expect(await screen.findByText(/Demand remains uncovered/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/^Critical overload$/i)).length).toBeGreaterThan(0);
    const criticalAlert = (await screen.findByText(/Critical overload detected/i)).closest('li');
    expect(criticalAlert?.querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('dashboard-utilization-chart')).toBeInTheDocument();
  });

  it('shows the uncovered-demand alert with one decimal place, not a raw float', async () => {
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
    await demandSnapshotsRepository.put({
      id: '44444444-4444-4444-4444-444444444444',
      importBatchId: 'manual',
      projectCode: 'E0100',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      year: 2026,
      month: 11,
      demandDays: 229.94511422620783,
      supplyDays: 0,
      origin: 'manual-adjustment',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    render(<DashboardPage />);

    await screen.findByRole('heading', { name: /^Dashboard$/i });
    await userEvent.selectOptions(screen.getByLabelText(/Alert focus month/i), 'November');

    expect(await screen.findByText('229.9 d remain uncovered in November.')).toBeInTheDocument();
  });

  it('narrows the utilization trend to the selected resource type', async () => {
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
    await resourceTypesRepository.put({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      label: 'Analyst',
      shortCode: 'ANA',
      color: '#00427f',
      status: 'active',
      displayOrder: 2,
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
    await resourcesRepository.put({
      id: '22222222-2222-2222-2222-222222222222',
      firstName: 'Bob',
      lastName: 'Durand',
      resourceTypeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await workingDaysRepository.put({
      id: '33333333-3333-3333-3333-333333333333',
      year: 2026,
      month: 9,
      workingDaysCount: 20,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<DashboardPage />);

    await screen.findByRole('heading', { name: /^Dashboard$/i });

    const unfilteredTotal = Number(
      (await screen.findByTestId('dashboard-trend-total-capacity')).dataset.totalNetCapacity,
    );
    expect(unfilteredTotal).toBe(40);

    await user.selectOptions(screen.getByLabelText(/^Resource type$/i), 'DEV');

    await screen.findByTestId('dashboard-trend-total-capacity');
    const filteredTotal = Number(
      screen.getByTestId('dashboard-trend-total-capacity').dataset.totalNetCapacity,
    );
    expect(filteredTotal).toBe(20);
  });
});
