import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CapacityCommandCenterPage } from '@/features/capacity';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const workingDaysRepository = createRepository('workingDaysCalendars');
const allocationsRepository = createRepository('allocations');

describe('CapacityCommandCenterPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('renders a virtualized heatmap with labeled utilization badges', async () => {
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
    await workingDaysRepository.put({
      id: '22222222-2222-2222-2222-222222222222',
      year: 2026,
      month: 1,
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
      month: 1,
      allocatedDays: 25,
      origin: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<CapacityCommandCenterPage />);

    const body = await screen.findByTestId('capacity-virtualized-body');
    expect(body).toBeInTheDocument();
    expect(await screen.findByText('Alice Martin')).toBeInTheDocument();
    expect(await screen.findByText(/Critical overload/i)).toBeInTheDocument();
    expect(await screen.findByText(/125%/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Critical overload/i }));

    await waitFor(() => {
      const drilldown = screen.getByRole('heading', { name: /Drill-down/i }).closest('section');
      expect(drilldown).not.toBeNull();
      expect(
        within(drilldown as HTMLElement).getByText(/Assigned load: 25 d/i),
      ).toBeInTheDocument();
    });
  });
});
