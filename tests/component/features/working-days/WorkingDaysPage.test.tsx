import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WorkingDaysPage } from '@/features/working-days';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const workingDaysRepository = createRepository('workingDaysCalendars');

describe('WorkingDaysPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('saves the monthly calendar and shows the annual total', async () => {
    const user = userEvent.setup();
    render(<WorkingDaysPage />);

    const januaryInput = await screen.findByLabelText(/January working days/i);
    const februaryInput = await screen.findByLabelText(/February working days/i);

    await user.clear(januaryInput);
    await user.type(januaryInput, '20');
    await user.clear(februaryInput);
    await user.type(februaryInput, '21');
    await user.click(screen.getByRole('button', { name: /Save calendar/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Working days saved for/i);
    expect(screen.getByText('Annual total')).toBeInTheDocument();

    await waitFor(async () => {
      const entries = await workingDaysRepository.getAll();
      expect(entries).toHaveLength(12);
    });
  });

  it('duplicates the current year into the next year', async () => {
    const user = userEvent.setup();
    render(<WorkingDaysPage />);

    await user.click(screen.getByRole('button', { name: /Duplicate to next year/i }));
    await user.click(screen.getByRole('button', { name: /Duplicate year/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Working days duplicated from/i);
  });
});
