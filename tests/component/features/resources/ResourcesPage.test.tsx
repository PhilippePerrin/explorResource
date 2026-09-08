import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ResourcesPage } from '@/features/resources';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const companiesRepository = createRepository('companies');
const projectsRepository = createRepository('projects');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const workingDaysRepository = createRepository('workingDaysCalendars');
const allocationsRepository = createRepository('allocations');

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <ResourcesPage />
    </MemoryRouter>,
  );
}

function getSectionForHeading(name: RegExp | string): HTMLElement {
  const section = screen.getByRole('heading', { name }).closest('section');

  if (!section) {
    throw new Error(`Unable to locate section for heading ${String(name)}.`);
  }

  return section;
}

describe('ResourcesPage', () => {
  beforeEach(async () => {
    await deletePlannerDb();
    window.localStorage.clear();
  });

  it('creates an external resource with a company', async () => {
    await resourceTypesRepository.put({
      id: '513914fb-b956-4d15-84d9-b276873949aa',
      label: 'Developer',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await companiesRepository.put({
      id: '36aa0d16-1ac7-41d6-b4c1-83e0efb9800a',
      name: 'Acme Partners',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    renderPage();
    const detailsSection = getSectionForHeading(/Create resource/i);
    await within(detailsSection).findByRole('option', { name: 'Developer' });

    await user.type(screen.getByLabelText(/First name/i), 'Alice');
    await user.type(screen.getByLabelText(/Last name/i), 'Martin');
    await user.selectOptions(
      within(detailsSection).getByLabelText(/^Resource type$/i, {
        selector: 'select#resource-resource-type',
      }),
      '513914fb-b956-4d15-84d9-b276873949aa',
    );
    await user.selectOptions(
      within(detailsSection).getByLabelText(/Collaboration type/i, {
        selector: 'select#resource-collaboration-type',
      }),
      'external',
    );
    await user.selectOptions(
      within(detailsSection).getByLabelText(/^Company$/i, {
        selector: 'select#resource-company',
      }),
      '36aa0d16-1ac7-41d6-b4c1-83e0efb9800a',
    );
    await user.click(screen.getByRole('button', { name: /Create resource/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Resource created\./i);
    expect(await screen.findByText('Alice Martin')).toBeInTheDocument();

    await waitFor(async () => {
      const resources = await resourcesRepository.getAll();
      expect(resources[0]?.collaborationType).toBe('external');
      expect(resources[0]?.companyId).toBe('36aa0d16-1ac7-41d6-b4c1-83e0efb9800a');
    });
  });

  it('offers archive only when a resource has historical references', async () => {
    await resourceTypesRepository.put({
      id: '513914fb-b956-4d15-84d9-b276873949aa',
      label: 'Developer',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourcesRepository.put({
      id: '90593ccf-d03f-4dfb-8f94-fab1d4e6657b',
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: '513914fb-b956-4d15-84d9-b276873949aa',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await allocationsRepository.put({
      id: '361a4489-8263-49ef-adb0-70f3391ea8d1',
      resourceId: '90593ccf-d03f-4dfb-8f94-fab1d4e6657b',
      projectCode: 'E0100',
      resourceTypeId: '513914fb-b956-4d15-84d9-b276873949aa',
      year: 2026,
      month: 1,
      allocatedDays: 3,
      origin: 'manual',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    renderPage();

    const resourceListSection = getSectionForHeading(/Resource list/i);

    await waitFor(() => {
      expect(within(resourceListSection).getByText('Alice Martin')).toBeInTheDocument();
      expect(
        within(resourceListSection).queryByRole('button', { name: /Delete permanently/i }),
      ).not.toBeInTheDocument();
      expect(
        within(resourceListSection).getByText(
          /Archive only: resource has allocation or absence history\./i,
        ),
      ).toBeInTheDocument();
    });

    await user.click(within(resourceListSection).getByRole('button', { name: /^Archive$/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Archive$/i }),
    );

    await waitFor(async () => {
      const resources = await resourcesRepository.getAll();
      expect(resources[0]?.status).toBe('archived');
    });
  });

  it('creates an allocation, flags over-service, and refreshes the monthly summary', async () => {
    await resourceTypesRepository.put({
      id: '513914fb-b956-4d15-84d9-b276873949aa',
      label: 'Developer',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourcesRepository.put({
      id: '90593ccf-d03f-4dfb-8f94-fab1d4e6657b',
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: '513914fb-b956-4d15-84d9-b276873949aa',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await projectsRepository.put({
      id: '1be5be37-cd25-4045-9f75-2a53d9789219',
      code: 'E0100',
      name: 'Commercial Analytics',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await demandSnapshotsRepository.put({
      id: 'e9a9d2ee-1e6d-4d98-80c1-1bc17c15db2c',
      importBatchId: 'manual',
      projectCode: 'E0100',
      resourceTypeId: '513914fb-b956-4d15-84d9-b276873949aa',
      year: 2026,
      month: 2,
      demandDays: 5,
      supplyDays: 0,
      origin: 'manual-adjustment',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await workingDaysRepository.put({
      id: '13d8108f-43f0-46ca-bd62-f84f2c5d34bc',
      year: 2026,
      month: 2,
      workingDaysCount: 20,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    renderPage();

    const resourceListSection = getSectionForHeading(/Resource list/i);
    await waitFor(() => {
      expect(within(resourceListSection).getByText('Alice Martin')).toBeInTheDocument();
    });

    await user.click(within(resourceListSection).getByRole('button', { name: /Edit details/i }));
    const allocationSection = getSectionForHeading(/Allocations for this resource/i);

    await user.selectOptions(within(allocationSection).getByLabelText(/^Project$/i), 'E0100');
    await user.selectOptions(
      within(allocationSection).getByLabelText(/Allocation resource type/i),
      '513914fb-b956-4d15-84d9-b276873949aa',
    );
    await user.clear(
      within(allocationSection).getByLabelText(/^Year$/i, {
        selector: 'input#allocation-year',
      }),
    );
    await user.type(
      within(allocationSection).getByLabelText(/^Year$/i, {
        selector: 'input#allocation-year',
      }),
      '2026',
    );
    await user.selectOptions(
      within(allocationSection).getByLabelText(/^Month$/i, {
        selector: 'select#allocation-month',
      }),
      '2',
    );
    await user.clear(
      within(allocationSection).getByLabelText(/Allocated days/i, {
        selector: 'input#allocation-allocated-days',
      }),
    );
    await user.type(
      within(allocationSection).getByLabelText(/Allocated days/i, {
        selector: 'input#allocation-allocated-days',
      }),
      '6',
    );

    expect(
      await screen.findByText(/Over-service: this allocation exceeds the remaining demand by/i),
    ).toBeInTheDocument();

    await user.click(within(allocationSection).getByRole('button', { name: /Create allocation/i }));

    await waitFor(async () => {
      const allocations = await allocationsRepository.getAll();
      expect(allocations).toHaveLength(1);
      expect(allocations[0]?.allocatedDays).toBe(6);
      expect(await screen.findByRole('status')).toHaveTextContent(/Allocation created\./i);
    });

    const summarySection = getSectionForHeading(/Monthly resource summary/i);

    await waitFor(() => {
      expect(within(summarySection).getByText(/Assigned load/i)).toBeInTheDocument();
      expect(within(summarySection).getByText('6 d')).toBeInTheDocument();
      expect(within(summarySection).getByText('14 d')).toBeInTheDocument();
      expect(screen.getByText(/Over-served/i)).toBeInTheDocument();
      expect(screen.getAllByLabelText(/^Over-served\./i).length).toBeGreaterThan(0);
    });
  }, 10000);

  it('filters resources, restores favorites, and shows shared demand/utilization badges', async () => {
    await resourceTypesRepository.put({
      id: '513914fb-b956-4d15-84d9-b276873949aa',
      label: 'Developer',
      shortCode: 'DEV',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await companiesRepository.put({
      id: '36aa0d16-1ac7-41d6-b4c1-83e0efb9800a',
      name: 'Acme Partners',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourcesRepository.put({
      id: '90593ccf-d03f-4dfb-8f94-fab1d4e6657b',
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: '513914fb-b956-4d15-84d9-b276873949aa',
      collaborationType: 'external',
      companyId: '36aa0d16-1ac7-41d6-b4c1-83e0efb9800a',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourcesRepository.put({
      id: '99999999-d03f-4dfb-8f94-fab1d4e6657b',
      firstName: 'Bob',
      lastName: 'Durand',
      resourceTypeId: '513914fb-b956-4d15-84d9-b276873949aa',
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await projectsRepository.put({
      id: '1be5be37-cd25-4045-9f75-2a53d9789219',
      code: 'E0100',
      name: 'Commercial Analytics',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await demandSnapshotsRepository.put({
      id: 'e9a9d2ee-1e6d-4d98-80c1-1bc17c15db2c',
      importBatchId: 'manual',
      projectCode: 'E0100',
      resourceTypeId: '513914fb-b956-4d15-84d9-b276873949aa',
      year: 2026,
      month: 2,
      demandDays: 5,
      supplyDays: 0,
      origin: 'manual-adjustment',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await workingDaysRepository.put({
      id: '13d8108f-43f0-46ca-bd62-f84f2c5d34bc',
      year: 2026,
      month: 2,
      workingDaysCount: 20,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await allocationsRepository.put({
      id: '361a4489-8263-49ef-adb0-70f3391ea8d1',
      resourceId: '90593ccf-d03f-4dfb-8f94-fab1d4e6657b',
      projectCode: 'E0100',
      resourceTypeId: '513914fb-b956-4d15-84d9-b276873949aa',
      year: 2026,
      month: 2,
      allocatedDays: 25,
      origin: 'manual',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    renderPage();

    const resourceListSection = getSectionForHeading(/Resource list/i);
    await waitFor(() => {
      expect(within(resourceListSection).getByText('Alice Martin')).toBeInTheDocument();
      expect(within(resourceListSection).getByText('Bob Durand')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Search resources/i), 'Alice');
    await waitFor(() => {
      expect(within(resourceListSection).getByText('Alice Martin')).toBeInTheDocument();
      expect(within(resourceListSection).queryByText('Bob Durand')).not.toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Save current filters as favorite/i), 'Alice view');
    await user.click(screen.getByRole('button', { name: /Save favorite/i }));
    await user.clear(screen.getByLabelText(/Search resources/i));
    await user.type(screen.getByLabelText(/Search resources/i), 'Bob');
    await waitFor(() => {
      expect(within(resourceListSection).getByText('Bob Durand')).toBeInTheDocument();
      expect(within(resourceListSection).queryByText('Alice Martin')).not.toBeInTheDocument();
    });

    await user.selectOptions(
      screen.getByLabelText(/Saved favorites/i),
      screen.getByRole('option', { name: 'Alice view' }),
    );
    await user.click(screen.getByRole('button', { name: /Apply favorite/i }));
    await waitFor(() => {
      expect(within(resourceListSection).getByText('Alice Martin')).toBeInTheDocument();
      expect(within(resourceListSection).queryByText('Bob Durand')).not.toBeInTheDocument();
    });

    await user.click(within(resourceListSection).getByRole('button', { name: /Edit details/i }));

    const summarySection = getSectionForHeading(/Monthly resource summary/i);
    await user.selectOptions(within(summarySection).getByLabelText(/^Month$/i), '2');
    await waitFor(() => {
      expect(within(summarySection).getByText(/Critical overload/i)).toBeInTheDocument();
      expect(within(summarySection).getByText(/125%/i)).toBeInTheDocument();
      expect(screen.getAllByLabelText(/^Critical overload\./i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Over-served/i)).toBeInTheDocument();
      expect(screen.getAllByLabelText(/^Over-served\./i).length).toBeGreaterThan(0);
    });
  }, 10000);
});
