import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ResourceTypesPage } from '@/features/resource-types';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourceTypesRepository = createRepository('resourceTypes');
const resourcesRepository = createRepository('resources');

describe('ResourceTypesPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('creates a resource type', async () => {
    const user = userEvent.setup();
    render(<ResourceTypesPage />);

    await user.type(screen.getByLabelText(/^Label$/i), 'Developer');
    await user.type(screen.getByLabelText(/Display order/i), '1');
    await user.click(screen.getByRole('button', { name: /Create resource type/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Resource type created\./i);
    expect(await screen.findByText('Developer')).toBeInTheDocument();
  });

  it('offers archive only when a resource type is referenced', async () => {
    await resourceTypesRepository.put({
      id: 'b0f2795b-5675-4d14-a0a0-b2c4e28c61e0',
      label: 'Analyst',
      shortCode: 'ANA',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourcesRepository.put({
      id: 'fefd5f72-7153-48d3-9f56-bd86bf43d3f8',
      firstName: 'Bob',
      lastName: 'Martin',
      resourceTypeId: 'b0f2795b-5675-4d14-a0a0-b2c4e28c61e0',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<ResourceTypesPage />);

    expect(await screen.findByText('Analyst')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete permanently/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Archive$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Archive$/i }),
    );

    await waitFor(async () => {
      const resourceTypes = await resourceTypesRepository.getAll();
      expect(resourceTypes[0]?.status).toBe('archived');
    });
  });
});
