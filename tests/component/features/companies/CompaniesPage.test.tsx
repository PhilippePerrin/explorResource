import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CompaniesPage } from '@/features/companies';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const companiesRepository = createRepository('companies');
const resourcesRepository = createRepository('resources');

describe('CompaniesPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('creates a company through the form', async () => {
    const user = userEvent.setup();
    render(<CompaniesPage />);

    await user.click(screen.getByRole('button', { name: /New company/i }));
    const drawer = await screen.findByRole('dialog', { name: /Create company/i });

    await user.type(within(drawer).getByLabelText(/Company name/i), 'Acme Partners');
    await user.click(within(drawer).getByRole('button', { name: /Create company/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Company created\./i);
    expect(await screen.findByText('Acme Partners')).toBeInTheDocument();
  });

  it('archives a referenced company instead of offering deletion', async () => {
    await companiesRepository.put({
      id: '832cb775-a1b4-4eeb-afd6-6635b29971e8',
      name: 'BioMérieux',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourcesRepository.put({
      id: '37d4ec4e-e638-4c13-8b58-f154f4dfd965',
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: '32ea2c21-cb2f-4aa3-b3f4-b763703c67ce',
      collaborationType: 'external',
      companyId: '832cb775-a1b4-4eeb-afd6-6635b29971e8',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<CompaniesPage />);

    expect(await screen.findByText('BioMérieux')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete permanently/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Archive only: company is still referenced\./i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Archive$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Archive$/i }),
    );

    await waitFor(async () => {
      const companies = await companiesRepository.getAll();
      expect(companies[0]?.status).toBe('archived');
    });
  });
});
