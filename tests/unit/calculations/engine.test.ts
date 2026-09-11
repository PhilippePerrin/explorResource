import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VISUAL_THRESHOLDS,
  type Allocation,
  type WorkingDaysCalendar,
} from '@/domain/entities';
import {
  capaciteBrute,
  capaciteDisponible,
  capaciteNette,
  chargeAffectee,
  chargeNonAffecteeProjet,
  classifyUtilizationStatus,
  resolveWorkingDaysByMonth,
  tauxUtilisation,
  type UtilizationStatus,
} from '@/domain/calculations';

function buildCalendarEntry(overrides: Partial<WorkingDaysCalendar> = {}): WorkingDaysCalendar {
  return {
    id: '5a97edff-c094-4ac6-b615-0f9d24431fc9',
    year: 2026,
    month: 1,
    workingDaysCount: 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildAllocation(overrides: Partial<Allocation> = {}): Allocation {
  return {
    id: '60da46e3-4816-4226-abd8-d428ac3c1b82',
    resourceId: 'ce926fe4-fc0c-4744-86f0-1b2e3a331da7',
    projectCode: 'E1234',
    resourceTypeId: '2e8aec83-6118-483d-852a-067f74b0df70',
    year: 2026,
    month: 1,
    allocatedDays: 5,
    origin: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('capacity and workload calculations', () => {
  it('computes gross capacity from the working-days calendar entry', () => {
    expect(capaciteBrute(buildCalendarEntry({ workingDaysCount: 21.5 }))).toBe(21.5);
  });

  it('computes net capacity and clamps it to zero', () => {
    expect(capaciteNette(20, 3.5)).toBe(16.5);
    expect(capaciteNette(2, 4)).toBe(0);
  });

  it('resolves working days per month, using null for unconfigured months', () => {
    const calendars = [
      buildCalendarEntry({ id: '1a1a1a1a-31f1-4d35-a53e-e5b6c17194c2', month: 1, workingDaysCount: 21 }),
      buildCalendarEntry({ id: '2b2b2b2b-31f1-4d35-a53e-e5b6c17194c2', month: 3, workingDaysCount: 22 }),
      buildCalendarEntry({
        id: '3c3c3c3c-31f1-4d35-a53e-e5b6c17194c2',
        year: 2025,
        month: 2,
        workingDaysCount: 19,
      }),
    ];

    const result = resolveWorkingDaysByMonth(2026, calendars);

    expect(result).toHaveLength(12);
    expect(result[0]).toBe(21);
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(22);
    expect(result.slice(3)).toEqual(Array(9).fill(null));
    expect(resolveWorkingDaysByMonth(2026, [])).toEqual(Array(12).fill(null));
  });

  it('sums assigned load for the requested resource/month only', () => {
    const targetResourceId = 'ce926fe4-fc0c-4744-86f0-1b2e3a331da7';
    const allocations = [
      buildAllocation({ id: '0e59266c-31f1-4d35-a53e-e5b6c17194c2', allocatedDays: 2.5 }),
      buildAllocation({ id: '67fa6208-29c8-43d0-9c69-c15eb684d0a6', allocatedDays: 1.5 }),
      buildAllocation({
        id: '5c25a5fc-8566-4c90-bb77-c90c984ac92f',
        resourceId: 'bc6b24b1-b2d2-45dc-9bd8-7b027668af70',
        allocatedDays: 99,
      }),
      buildAllocation({
        id: 'e89d5d67-873d-4794-8a45-0db0dddb71f5',
        month: 2,
        allocatedDays: 99,
      }),
    ];

    expect(chargeAffectee(allocations, targetResourceId, 2026, 1)).toBe(4);
  });

  it('computes available capacity and allows overload', () => {
    expect(capaciteDisponible(16, 10.5)).toBe(5.5);
    expect(capaciteDisponible(10, 12.5)).toBe(-2.5);
  });

  it('normalizes floating-point residue to exactly zero on derived outputs', () => {
    expect(capaciteDisponible(0.3, 0.30000000000000043)).toBe(0);
  });

  it('computes unassigned project demand and clamps it to zero', () => {
    expect(chargeNonAffecteeProjet(12, 4.5)).toBe(7.5);
    expect(chargeNonAffecteeProjet(3, 4)).toBe(0);
  });
});

describe('utilization calculations', () => {
  it('computes a standard utilization rate and status', () => {
    expect(tauxUtilisation(12, 20, DEFAULT_VISUAL_THRESHOLDS)).toEqual({
      ratePercent: 60,
      status: 'available',
      isCriticalOverload: false,
    });
  });

  it('returns zero utilization when capacity and load are both zero', () => {
    expect(tauxUtilisation(0, 0, DEFAULT_VISUAL_THRESHOLDS)).toEqual({
      ratePercent: 0,
      status: 'available',
      isCriticalOverload: false,
    });
  });

  it('flags critical overload when capacity is zero and load is positive', () => {
    expect(tauxUtilisation(2, 0, DEFAULT_VISUAL_THRESHOLDS)).toEqual({
      ratePercent: null,
      status: 'critical-overload',
      isCriticalOverload: true,
    });
  });

  it('classifies exact threshold boundaries deterministically', () => {
    const cases: Array<[number, UtilizationStatus]> = [
      [79.9, 'available'],
      [80, 'used'],
      [99.9, 'used'],
      [100, 'used'],
      [100.1, 'overload'],
      [110, 'overload'],
      [110.1, 'critical-overload'],
    ];

    for (const [ratePercent, expectedStatus] of cases) {
      expect(classifyUtilizationStatus(ratePercent, DEFAULT_VISUAL_THRESHOLDS)).toBe(
        expectedStatus,
      );
    }
  });

  it('marks negative available capacity as overload through the utilization status', () => {
    const availableCapacityDays = capaciteDisponible(10, 10.5);

    expect(availableCapacityDays).toBeLessThan(0);
    expect(tauxUtilisation(10.5, 10, DEFAULT_VISUAL_THRESHOLDS).status).toBe('overload');
  });

  it('supports custom threshold configurations from application settings', () => {
    const customThresholds = {
      availableBelow: 70,
      usedFrom: 70,
      usedTo: 90,
      overloadFrom: 90,
      overloadTo: 105,
      criticalAbove: 105,
    } as const;

    expect(classifyUtilizationStatus(69.9, customThresholds)).toBe('available');
    expect(classifyUtilizationStatus(70, customThresholds)).toBe('used');
    expect(classifyUtilizationStatus(95, customThresholds)).toBe('overload');
    expect(classifyUtilizationStatus(105.1, customThresholds)).toBe('critical-overload');
  });
});
