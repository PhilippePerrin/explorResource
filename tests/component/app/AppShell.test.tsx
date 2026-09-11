import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { AppShell } from '@/app/AppShell';
import { deletePlannerDb } from '@/persistence/db';

describe('AppShell', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await deletePlannerDb();
  });

  it('exports a database backup from the always-visible header icon', async () => {
    const user = userEvent.setup();
    const objectUrls: string[] = [];

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      const url = `blob:app-shell-test-${objectUrls.length + 1}`;
      objectUrls.push(url);

      if (!(blob instanceof Blob)) {
        throw new Error('Expected the export to create a Blob download.');
      }

      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppShell>
          <p>Page content</p>
        </AppShell>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Export database backup/i }));

    await waitFor(() => {
      expect(objectUrls).toHaveLength(1);
    });
    expect(await screen.findByText(/Backup exported\./i)).toBeInTheDocument();
  });

  it('pins the sidebar to the viewport on desktop so it stays visible while the page scrolls', () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppShell>
          <p>Page content</p>
        </AppShell>
      </MemoryRouter>,
    );

    const sidebar = document.querySelector('aside');
    expect(sidebar).not.toBeNull();
    expect(sidebar?.className).toMatch(/md:sticky/);
    expect(sidebar?.className).toMatch(/md:top-0/);
  });
});
