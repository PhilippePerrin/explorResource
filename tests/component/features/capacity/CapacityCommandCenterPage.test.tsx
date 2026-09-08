import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { CapacityCommandCenterPage } from '@/features/capacity';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const companiesRepository = createRepository('companies');
const workingDaysRepository = createRepository('workingDaysCalendars');
const allocationsRepository = createRepository('allocations');

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <CapacityCommandCenterPage />
    </MemoryRouter>,
  );
}

describe('CapacityCommandCenterPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
    window.localStorage.clear();
  });

  it('renders a virtualized heatmap with persistent filters and labeled utilization badges', async () => {
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
    await companiesRepository.put({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      name: 'Acme Partners',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await resourcesRepository.put({
      id: '11111111-1111-1111-1111-111111111111',
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      collaborationType: 'external',
      companyId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await resourcesRepository.put({
      id: '44444444-4444-4444-4444-444444444444',
      firstName: 'Bob',
      lastName: 'Durand',
      resourceTypeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
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
    renderPage();

    const body = await screen.findByTestId('capacity-virtualized-body');
    expect(body).toBeInTheDocument();
    expect(await screen.findByText('Alice Martin')).toBeInTheDocument();
    expect(await screen.findByText('Bob Durand')).toBeInTheDocument();
    expect(await screen.findByText(/Critical overload/i)).toBeInTheDocument();
    expect(await screen.findByText(/125%/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Critical overload\./i).length).toBeGreaterThan(0);

    const januaryCell = screen.getByRole('button', { name: /Alice Martin, January 2026\./i });
    januaryCell.focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: /Bob Durand, January 2026\./i })).toHaveFocus();

    await user.type(screen.getByLabelText(/^Search$/i), 'Alice');
    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
      expect(screen.queryByText('Bob Durand')).not.toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Save current filters as favorite/i), 'Alice only');
    await user.click(screen.getByRole('button', { name: /Save favorite/i }));
    await user.clear(screen.getByLabelText(/^Search$/i));
    await user.type(screen.getByLabelText(/^Search$/i), 'Bob');
    await waitFor(() => {
      expect(screen.queryByText('Alice Martin')).not.toBeInTheDocument();
      expect(screen.getByText('Bob Durand')).toBeInTheDocument();
    });

    await user.selectOptions(
      screen.getByLabelText(/Saved favorites/i),
      screen.getByRole('option', { name: 'Alice only' }),
    );
    await user.click(screen.getByRole('button', { name: /Apply favorite/i }));
    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument();
      expect(screen.queryByText('Bob Durand')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Alice Martin, January 2026\./i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Drill-down/i })).toBeInTheDocument();
      expect(screen.getByText(/Assigned load: 25 d/i)).toBeInTheDocument();
    });
  });

  it('handles a 200-resource by 12-month synthetic dataset with a stable virtual canvas', async () => {
    await resourceTypesRepository.put({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      label: 'Developer',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    for (let month = 1; month <= 12; month += 1) {
      await workingDaysRepository.put({
        id: `20000000-0000-4000-8000-${month.toString(16).padStart(12, '0')}`,
        year: 2026,
        month,
        workingDaysCount: 20,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    }

    for (let index = 1; index <= 200; index += 1) {
      const resourceId = `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
      await resourcesRepository.put({
        id: resourceId,
        firstName: 'Resource',
        lastName: index.toString().padStart(3, '0'),
        resourceTypeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        collaborationType: 'internal',
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      for (let month = 1; month <= 12; month += 1) {
        await allocationsRepository.put({
          id: `10000000-0000-4000-8000-${(index * 100 + month).toString(16).padStart(12, '0')}`,
          resourceId,
          projectCode: 'E0100',
          resourceTypeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          year: 2026,
          month,
          allocatedDays: 10,
          origin: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
      }
    }

    renderPage();

    const body = await screen.findByTestId('capacity-virtualized-body');
    await screen.findByText('Resource 001');
    expect((body.firstElementChild as HTMLElement | null)?.style.height).toBe(`${200 * 58}px`);

    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      value: 10000,
      writable: true,
    });
    fireEvent.scroll(body);

    await waitFor(() => {
      expect(screen.getByText('Resource 173')).toBeInTheDocument();
    });
  }, 20000);
});
