import { describe, expect, it } from 'vitest';

import { buildDashboardViewModel } from '@/features/dashboard';

describe('dashboardModel', () => {
  it('builds alerts and demand deltas for the selected year', () => {
    const viewModel = buildDashboardViewModel({
      resources: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          firstName: 'Alice',
          lastName: 'Martin',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          collaborationType: 'internal',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          firstName: 'Bob',
          lastName: 'Durand',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          collaborationType: 'internal',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      allocations: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          resourceId: '11111111-1111-1111-1111-111111111111',
          projectCode: 'E0100',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 2,
          allocatedDays: 22,
          origin: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          resourceId: '22222222-2222-2222-2222-222222222222',
          projectCode: 'E0200',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 2,
          allocatedDays: 4,
          origin: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      demandSnapshots: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          importBatchId: 'aaaaaaaa-1111-1111-1111-111111111111',
          projectCode: 'E0100',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 2,
          demandDays: 24,
          supplyDays: 0,
          origin: 'import',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '66666666-6666-6666-6666-666666666666',
          importBatchId: 'bbbbbbbb-1111-1111-1111-111111111111',
          projectCode: 'E0100',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 2,
          demandDays: 20,
          supplyDays: 0,
          origin: 'import',
          createdAt: '2025-12-01T00:00:00.000Z',
          updatedAt: '2025-12-01T00:00:00.000Z',
        },
        {
          id: '77777777-7777-7777-7777-777777777777',
          importBatchId: 'aaaaaaaa-1111-1111-1111-111111111111',
          projectCode: 'E0200',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 2,
          demandDays: 3,
          supplyDays: 0,
          origin: 'import',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '88888888-8888-8888-8888-888888888888',
          importBatchId: 'bbbbbbbb-1111-1111-1111-111111111111',
          projectCode: 'E0200',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 2,
          demandDays: 8,
          supplyDays: 0,
          origin: 'import',
          createdAt: '2025-12-01T00:00:00.000Z',
          updatedAt: '2025-12-01T00:00:00.000Z',
        },
      ],
      workingDaysCalendars: [
        {
          id: '99999999-9999-9999-9999-999999999999',
          year: 2026,
          month: 2,
          workingDaysCount: 20,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      resourceNonWorkingDays: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          resourceId: '22222222-2222-2222-2222-222222222222',
          year: 2026,
          month: 2,
          days: 20,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      appSettings: null,
      importBatches: [
        {
          id: 'aaaaaaaa-1111-1111-1111-111111111111',
          importedAt: '2026-01-01T00:00:00.000Z',
          referenceDate: '2026-01-01',
          note: 'latest',
          fileName: 'latest.xlsx',
          fileSha256: 'a'.repeat(64),
          rowCount: 1,
          status: 'validated',
          kind: 'demand',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'bbbbbbbb-1111-1111-1111-111111111111',
          importedAt: '2025-12-01T00:00:00.000Z',
          referenceDate: '2025-12-01',
          note: 'previous',
          fileName: 'previous.xlsx',
          fileSha256: 'b'.repeat(64),
          rowCount: 1,
          status: 'validated',
          kind: 'demand',
          createdAt: '2025-12-01T00:00:00.000Z',
          updatedAt: '2025-12-01T00:00:00.000Z',
        },
      ],
      year: 2026,
      selectedMonth: 2,
    });

    expect(viewModel.selectedMonthMetrics.overloadedResourcesCount).toBe(2);
    expect(viewModel.selectedMonthMetrics.criticalResourcesCount).toBe(1);
    expect(viewModel.selectedMonthMetrics.remainingDemandDays).toBe(2);
    expect(viewModel.alerts.map((alert) => alert.title)).toContain('Critical overload detected');
    expect(viewModel.alerts.map((alert) => alert.title)).toContain('Demand remains uncovered');
    expect(viewModel.demandVariation).toMatchObject({
      positiveDeltaDays: 4,
      negativeDeltaDays: -5,
      netDeltaDays: -1,
    });
  });

  it('formats the uncovered-demand alert to one decimal place instead of a raw float', () => {
    const viewModel = buildDashboardViewModel({
      resources: [],
      allocations: [],
      demandSnapshots: [
        {
          id: 'aaaaaaaa-1111-1111-1111-111111111111',
          importBatchId: 'batch-1',
          projectCode: 'E0100',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 11,
          demandDays: 229.94511422620783,
          supplyDays: 0,
          origin: 'import',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      workingDaysCalendars: [],
      resourceNonWorkingDays: [],
      appSettings: null,
      importBatches: [],
      year: 2026,
      selectedMonth: 11,
    });

    const alert = viewModel.alerts.find((entry) => entry.id === 'coverage-gap');
    expect(alert?.description).toBe('229.9 d remain uncovered in November.');
  });

  it('restricts monthly aggregation to the selected resource type when a filter is set', () => {
    const buildOptions = (resourceTypeFilter?: string) => ({
      resources: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          firstName: 'Alice',
          lastName: 'Martin',
          resourceTypeId: 'type-a',
          collaborationType: 'internal' as const,
          status: 'active' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          firstName: 'Bob',
          lastName: 'Durand',
          resourceTypeId: 'type-b',
          collaborationType: 'internal' as const,
          status: 'active' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      allocations: [],
      demandSnapshots: [
        {
          id: 'aaaaaaaa-1111-1111-1111-111111111111',
          importBatchId: 'batch-1',
          projectCode: 'E0100',
          resourceTypeId: 'type-a',
          year: 2026,
          month: 1,
          demandDays: 5,
          supplyDays: 0,
          origin: 'import' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'bbbbbbbb-1111-1111-1111-111111111111',
          importBatchId: 'batch-1',
          projectCode: 'E0200',
          resourceTypeId: 'type-b',
          year: 2026,
          month: 1,
          demandDays: 3,
          supplyDays: 0,
          origin: 'import' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      workingDaysCalendars: [
        {
          id: '99999999-9999-9999-9999-999999999999',
          year: 2026,
          month: 1,
          workingDaysCount: 20,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      resourceNonWorkingDays: [],
      appSettings: null,
      importBatches: [],
      year: 2026,
      selectedMonth: 1,
      resourceTypeFilter,
    });

    const unfiltered = buildDashboardViewModel(buildOptions());
    const filtered = buildDashboardViewModel(buildOptions('type-a'));

    expect(unfiltered.months[0]?.netCapacityDays).toBe(40);
    expect(unfiltered.months[0]?.remainingDemandDays).toBe(8);

    expect(filtered.months[0]?.netCapacityDays).toBe(20);
    expect(filtered.months[0]?.remainingDemandDays).toBe(5);
  });
});
