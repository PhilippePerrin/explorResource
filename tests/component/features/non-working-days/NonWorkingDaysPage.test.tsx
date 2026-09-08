import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NonWorkingDaysPage } from '@/features/non-working-days';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourcesRepository = createRepository('resources');
const nonWorkingDaysRepository = createRepository('resourceNonWorkingDays');

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
    render(<NonWorkingDaysPage />);

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
    render(<NonWorkingDaysPage />);

    await user.type(await screen.findByLabelText(/Alice Martin January non-working days/i), '1.5');
    await user.click(screen.getByRole('button', { name: /Duplicate year/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Duplicate year/i }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      /Non-working days duplicated from/i,
    );
  });
});
