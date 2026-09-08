import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ReleasesPage } from '@/features/releases';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const releasesRepository = createRepository('releases');
const projectsRepository = createRepository('projects');
const projectReleasesRepository = createRepository('projectReleases');

function getSectionForHeading(name: RegExp | string): HTMLElement {
  const section = screen.getByRole('heading', { name }).closest('section');

  if (!section) {
    throw new Error(`Unable to locate section for heading ${String(name)}.`);
  }

  return section;
}

describe('ReleasesPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('creates a release and links it to a project', async () => {
    await projectsRepository.put({
      id: '4a4ce45f-c0dd-447c-84a3-e91f16242b7b',
      code: 'E0100',
      name: 'Commercial Analytics',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<ReleasesPage />);

    await user.type(screen.getByLabelText(/Release name/i), 'Wave 1');
    await user.type(screen.getByLabelText(/Go-live date/i), '2026-10-15');
    await user.click(screen.getByLabelText(/E0100/i));
    await user.click(screen.getByRole('button', { name: /Create release/i }));

    const releaseListSection = getSectionForHeading(/Release list/i);

    await waitFor(
      async () => {
        const releases = await releasesRepository.getAll();
        const links = await projectReleasesRepository.getAll();

        expect(screen.getByRole('status')).toHaveTextContent(/Release created\./i);
        expect(releases.some((release) => release.name === 'Wave 1')).toBe(true);
        expect(
          links.some((link) => link.projectId === '4a4ce45f-c0dd-447c-84a3-e91f16242b7b'),
        ).toBe(true);
        expect(
          within(releaseListSection).queryByText(/No releases match/i),
        ).not.toBeInTheDocument();
        expect(
          within(releaseListSection).getByRole('button', { name: /Edit details/i }),
        ).toBeInTheDocument();
        expect(
          within(releaseListSection).getByRole('cell', { name: /October 15, 2026/i }),
        ).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
  }, 10000);

  it('offers archive only when a release is already linked to a project', async () => {
    await releasesRepository.put({
      id: '8b5e2a1d-3f53-4921-bc18-2db88cbdd3c5',
      name: 'Wave 1',
      goLiveDate: '2026-10-15',
      color: '#00427f',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await projectReleasesRepository.put({
      id: 'd133df9f-9df1-4e86-a005-f9fed4c0c4fe',
      projectId: '4a4ce45f-c0dd-447c-84a3-e91f16242b7b',
      releaseId: '8b5e2a1d-3f53-4921-bc18-2db88cbdd3c5',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<ReleasesPage />);

    const releaseListSection = getSectionForHeading(/Release list/i);

    await waitFor(
      () => {
        expect(
          within(releaseListSection).getByRole('button', { name: /Edit details/i }),
        ).toBeInTheDocument();
        expect(
          within(releaseListSection).queryByRole('button', { name: /Delete permanently/i }),
        ).not.toBeInTheDocument();
        expect(
          within(releaseListSection).getByText(/Archive only: release is linked to projects\./i),
        ).toBeInTheDocument();
      },
      { timeout: 8000 },
    );

    await user.click(screen.getByRole('button', { name: /^Archive$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Archive$/i }),
    );

    await waitFor(async () => {
      const releases = await releasesRepository.getAll();
      expect(releases[0]?.status).toBe('archived');
    });
  }, 10000);
});
