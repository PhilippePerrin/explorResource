import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { GroupsPage } from '@/features/projects';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const groupsRepository = createRepository('groups');

describe('GroupsPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('shows imported groups in a read-only detail view', async () => {
    await groupsRepository.put({
      id: '2d966e41-f331-4f9d-b292-6f278cf8c52f',
      code: 'GIS0006',
      label: 'GCOE',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<GroupsPage />);

    expect((await screen.findAllByText('GIS0006')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /View details/i }));
    expect(screen.getByText(/This page is intentionally read-only/i)).toBeInTheDocument();
    expect((await screen.findAllByText('GCOE')).length).toBeGreaterThan(0);
  });
});
