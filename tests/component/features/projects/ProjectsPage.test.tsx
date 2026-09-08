import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProjectsPage } from '@/features/projects';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const projectsRepository = createRepository('projects');
const releasesRepository = createRepository('releases');
const projectReleasesRepository = createRepository('projectReleases');
const demandSnapshotsRepository = createRepository('demandSnapshots');

describe('ProjectsPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('creates a project and links it to a release', async () => {
    await releasesRepository.put({
      id: '5e3d2a3a-bb88-4140-ba78-cf66f851eb5c',
      name: 'Wave 1',
      goLiveDate: '2026-10-15',
      color: '#00427f',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    await user.type(screen.getByLabelText(/Project code/i), 'e0100');
    await user.type(screen.getByLabelText(/Project name/i), 'Commercial Analytics');
    await user.click(screen.getByLabelText(/Wave 1/i));
    await user.click(screen.getByRole('button', { name: /Create project/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Project created\./i);
    expect(await screen.findByText('E0100')).toBeInTheDocument();

    await waitFor(async () => {
      const projects = await projectsRepository.getAll();
      const links = await projectReleasesRepository.getAll();

      expect(projects[0]?.code).toBe('E0100');
      expect(links[0]?.releaseId).toBe('5e3d2a3a-bb88-4140-ba78-cf66f851eb5c');
    });
  });

  it('offers archive only when the project is referenced by demand snapshots', async () => {
    await projectsRepository.put({
      id: 'ae8ec57d-19f7-4d52-92b1-9316cd2c4ed4',
      code: 'E0100',
      name: 'Commercial Analytics',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await demandSnapshotsRepository.put({
      id: '2a3e330a-66be-49ef-9303-574bd4b02d5e',
      importBatchId: 'manual',
      projectCode: 'E0100',
      resourceTypeId: 'a6d03841-fb1f-4be5-b749-511ba3a36168',
      year: 2026,
      month: 1,
      demandDays: 12,
      supplyDays: 4,
      origin: 'manual-adjustment',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<ProjectsPage />);

    expect(await screen.findByText('Commercial Analytics')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete permanently/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Archive only: project still has demand\/allocation references\./i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Archive$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Archive$/i }),
    );

    await waitFor(async () => {
      const projects = await projectsRepository.getAll();
      expect(projects[0]?.status).toBe('archived');
    });
  });
});
