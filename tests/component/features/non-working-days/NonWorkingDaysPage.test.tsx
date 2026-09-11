import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { NonWorkingDaysPage } from '@/features/non-working-days';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourcesRepository = createRepository('resources');
const nonWorkingDaysRepository = createRepository('resourceNonWorkingDays');
const workingDaysRepository = createRepository('workingDaysCalendars');
const resourceTypesRepository = createRepository('resourceTypes');

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <NonWorkingDaysPage />
    </MemoryRouter>,
  );
}

describe('NonWorkingDaysPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();

    await resourcesRepository.put({
      id: 'bc9efbe3-9cf0-4b85-b6da-992386099269',
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: '061a86d6-54ae-4a49-93f8-c44e9ea2d6d3',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourcesRepository.put({
      id: '1d2d5c82-5982-4c78-a8b7-2406bd9094cf',
      firstName: 'Bob',
      lastName: 'Martin',
      resourceTypeId: '061a86d6-54ae-4a49-93f8-c44e9ea2d6d3',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
  });

  it('pastes an Excel-style range into the grid and saves it', async () => {
    const user = userEvent.setup();
    renderPage();

    const firstCell = await screen.findByLabelText(/Alice Martin January non-working days/i);
    fireEvent.paste(firstCell, {
      clipboardData: {
        getData: () => '1\t2,5\n3\t4',
      },
    });

    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3')).toBeInTheDocument();
    expect(screen.getByDisplayValue('4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save grid/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Non-working days saved for/i);

    await waitFor(async () => {
      const entries = await nonWorkingDaysRepository.getAll();
      expect(entries).toHaveLength(4);
    });
  });

  it('duplicates a year to the next year', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/Alice Martin January non-working days/i), '1.5');
    await user.click(screen.getByRole('button', { name: /Duplicate year/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Duplicate year/i }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      /Non-working days duplicated from/i,
    );
  });

  it('shows a banner and dashes when no working-days calendar is configured for the year', async () => {
    renderPage();

    await screen.findByLabelText(/Alice Martin January non-working days/i);

    expect(
      screen.getByText(/No working-days calendar is configured for/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Configure working days/i })).toHaveAttribute(
      'href',
      '/working-days',
    );
    expect(screen.getByText('Working days (reference)')).toBeInTheDocument();
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
  });

  it('renders configured working days per month as a non-editable reference row', async () => {
    const currentYear = new Date().getFullYear();

    await workingDaysRepository.put({
      id: '3f9b7f0a-3b3a-4b7e-9b6a-6b1e0f5b5a01',
      year: currentYear,
      month: 1,
      workingDaysCount: 21,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await workingDaysRepository.put({
      id: '3f9b7f0a-3b3a-4b7e-9b6a-6b1e0f5b5a02',
      year: currentYear,
      month: 2,
      workingDaysCount: 20,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    renderPage();

    await screen.findByLabelText(/Alice Martin January non-working days/i);

    expect(
      screen.queryByText(/No working-days calendar is configured for/i),
    ).not.toBeInTheDocument();

    const referenceRow = screen.getByText('Working days (reference)').closest('tr');
    expect(referenceRow).not.toBeNull();
    expect(within(referenceRow as HTMLElement).getByText('21')).toBeInTheDocument();
    expect(within(referenceRow as HTMLElement).getByText('20')).toBeInTheDocument();
    expect(within(referenceRow as HTMLElement).getAllByText('–')).toHaveLength(10);
  });

  it('filters displayed resources by resource type without dropping saved data for hidden resources', async () => {
    const user = userEvent.setup();

    await resourceTypesRepository.put({
      id: '061a86d6-54ae-4a49-93f8-c44e9ea2d6d3',
      label: 'Developer',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourceTypesRepository.put({
      id: 'a1a86d6a-54ae-4a49-93f8-c44e9ea2d6d4',
      label: 'Analyst',
      shortCode: 'ANA',
      color: '#00427f',
      status: 'active',
      displayOrder: 2,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourcesRepository.put({
      id: 'c3f1a111-1111-4111-8111-111111111111',
      firstName: 'Cara',
      lastName: 'Nguyen',
      resourceTypeId: 'a1a86d6a-54ae-4a49-93f8-c44e9ea2d6d4',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    renderPage();

    fireEvent.change(await screen.findByLabelText(/Alice Martin January non-working days/i), {
      target: { value: '1.5' },
    });
    expect(await screen.findByText('Cara Nguyen')).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(/Resource type/i),
      'a1a86d6a-54ae-4a49-93f8-c44e9ea2d6d4',
    );

    expect(screen.queryByText('Alice Martin')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Martin')).not.toBeInTheDocument();
    expect(screen.getByText('Cara Nguyen')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save grid/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Non-working days saved for/i);

    await waitFor(async () => {
      const entries = await nonWorkingDaysRepository.getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.resourceId).toBe('bc9efbe3-9cf0-4b85-b6da-992386099269');
      expect(entries[0]?.days).toBe(1.5);
    });

    await user.selectOptions(screen.getByLabelText(/Resource type/i), 'all');
    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
  });
});
