import type {
  Allocation,
  DemandSnapshot,
  Resource,
  ResourceNonWorkingDays,
  WorkingDaysCalendar,
} from '@/domain/entities';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';

/**
 * Returns the gross monthly capacity in days for a resolved working-days calendar entry.
 *
 * Formula: `capaciteBrute = workingDaysCount`
 *
 * The caller is responsible for selecting the correct {@link WorkingDaysCalendar} entry for the
 * target year/month before invoking this function.
 *
 * @param workingDaysCalendarEntry - Calendar entry already resolved for the requested month.
 * @returns Gross capacity in working days for that month.
 */
export function capaciteBrute(
  workingDaysCalendarEntry: Pick<WorkingDaysCalendar, 'workingDaysCount'>,
): number {
  return normalizeAmount(workingDaysCalendarEntry.workingDaysCount);
}

/**
 * Resolves the configured working-days count for every month (January-December) of a year.
 *
 * `null` at an index means no {@link WorkingDaysCalendar} entry exists for that month, which is
 * distinct from a legitimate configured value of `0`.
 *
 * @param year - Target year.
 * @param calendars - Working-days calendar entries to search (any year, unfiltered).
 * @returns A 12-length array, index 0 = January, of gross capacity days or `null` when unconfigured.
 */
export function resolveWorkingDaysByMonth(
  year: number,
  calendars: readonly WorkingDaysCalendar[],
): (number | null)[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const entry = calendars.find((calendar) => calendar.year === year && calendar.month === month);
    return entry ? normalizeAmount(entry.workingDaysCount) : null;
  });
}

/**
 * Returns the net monthly capacity in days after subtracting non-working days.
 *
 * Formula: `capaciteNette = max(0, capaciteBrute - joursNonTravailles)`
 *
 * @param grossCapacityDays - Gross capacity in days for the month.
 * @param nonWorkingDays - Resource-specific non-working days for the same month, in days.
 * @returns Net capacity in days, clamped at zero.
 */
export function capaciteNette(
  grossCapacityDays: number,
  nonWorkingDays: number | Pick<ResourceNonWorkingDays, 'days'>,
): number {
  const nonWorkingDaysValue =
    typeof nonWorkingDays === 'number' ? nonWorkingDays : nonWorkingDays.days;

  return normalizeAmount(Math.max(0, grossCapacityDays - nonWorkingDaysValue));
}

/**
 * Sums all allocated days for a resource on a given month across every project.
 *
 * Formula:
 * `chargeAffectee = Σ Allocation.allocatedDays for that resource, that month, all projects`
 *
 * @param allocations - Allocation rows to aggregate.
 * @param resourceId - Target resource identifier.
 * @param year - Planning year.
 * @param month - Planning month (1-12).
 * @returns Assigned workload in days for the resource and month.
 */
export function chargeAffectee(
  allocations: readonly Allocation[],
  resourceId: Resource['id'],
  year: Allocation['year'],
  month: Allocation['month'],
): number {
  const assignedDays = allocations.reduce((total, allocation) => {
    if (
      allocation.resourceId !== resourceId ||
      allocation.year !== year ||
      allocation.month !== month
    ) {
      return total;
    }

    return total + allocation.allocatedDays;
  }, 0);

  return normalizeAmount(assignedDays);
}

/**
 * Computes the available monthly capacity in days.
 *
 * Formula: `capaciteDisponible = capaciteNette - chargeAffectee`
 *
 * A negative result is allowed and indicates overload.
 *
 * @param netCapacityDays - Net capacity in days for the month.
 * @param assignedLoadDays - Assigned workload in days for the same month.
 * @returns Available capacity in days. Negative values represent overload.
 */
export function capaciteDisponible(netCapacityDays: number, assignedLoadDays: number): number {
  return normalizeAmount(netCapacityDays - assignedLoadDays);
}

/**
 * Computes the unassigned portion of a project's demand for a month.
 *
 * Formula: `chargeNonAffecteeProjet = max(0, demande - affectationsCorrespondantes)`
 *
 * @param demandDays - Project demand for the targeted project/resource-type/month, in days.
 * @param allocatedDaysForThatDemand - Total allocations matching that demand, in days.
 * @returns Remaining unassigned demand in days, clamped at zero.
 */
export function chargeNonAffecteeProjet(
  demandDays: number | Pick<DemandSnapshot, 'demandDays'>,
  allocatedDaysForThatDemand: number,
): number {
  const demandDaysValue = typeof demandDays === 'number' ? demandDays : demandDays.demandDays;

  return normalizeAmount(Math.max(0, demandDaysValue - allocatedDaysForThatDemand));
}
