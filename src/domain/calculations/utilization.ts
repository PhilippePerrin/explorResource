import type { AppSettings } from '@/domain/entities';
import { DEFAULT_VISUAL_THRESHOLDS } from '@/domain/entities';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';

export type UtilizationStatus = 'available' | 'used' | 'overload' | 'critical-overload';

/**
 * Visual status thresholds taken from {@link AppSettings.visualThresholds}.
 */
export type UtilizationThresholds = AppSettings['visualThresholds'];

/**
 * Describes the computed utilization of a resource for one month.
 */
export interface UtilizationResult {
  /**
   * Utilization percentage in the `0..100+` range when net capacity is positive.
   *
   * When `netCapacityDays === 0` and `assignedLoadDays > 0`, the percentage is undefined and the
   * value is `null`. The critical-overload state is then conveyed by `status` and
   * `isCriticalOverload`.
   */
  ratePercent: number | null;
  /**
   * Domain status for the utilization band. UI code must map this to labels/icons/colors.
   */
  status: UtilizationStatus;
  /**
   * Explicit critical overload flag for the mandatory edge case where capacity is zero while
   * assigned load remains positive.
   */
  isCriticalOverload: boolean;
}

/**
 * Classifies a utilization rate into a domain status without encoding UI colors.
 *
 * Boundaries follow the business rules defaults:
 * - `< 80` → `available`
 * - `80..100` → `used`
 * - `> 100..110` → `overload`
 * - `> 110` → `critical-overload`
 *
 * The thresholds are configurable through {@link AppSettings.visualThresholds}. Exact boundary
 * values (for example `80`, `100`, `110`) remain deterministic and match the documented defaults.
 *
 * @param ratePercent - Utilization rate in percent.
 * @param thresholds - Status thresholds from application settings.
 * @returns Discriminated status for the given rate.
 */
export function classifyUtilizationStatus(
  ratePercent: number,
  thresholds: UtilizationThresholds = DEFAULT_VISUAL_THRESHOLDS,
): UtilizationStatus {
  const normalizedRate = Number(normalizeAmount(ratePercent).toFixed(10));

  if (normalizedRate < thresholds.availableBelow) {
    return 'available';
  }

  if (normalizedRate < thresholds.usedFrom) {
    return 'available';
  }

  if (normalizedRate <= thresholds.usedTo) {
    return 'used';
  }

  if (normalizedRate <= thresholds.overloadFrom) {
    return 'used';
  }

  if (normalizedRate <= thresholds.overloadTo) {
    return 'overload';
  }

  if (normalizedRate <= thresholds.criticalAbove) {
    return 'overload';
  }

  return 'critical-overload';
}

/**
 * Computes the utilization rate for one resource-month.
 *
 * Formula: `tauxUtilisation = chargeAffectee / capaciteNette * 100`
 *
 * Edge cases mandated by the business rules:
 * - `capaciteNette === 0 && chargeAffectee === 0` → `ratePercent = 0`, `status = 'available'`
 * - `capaciteNette === 0 && chargeAffectee > 0` → `ratePercent = null`,
 *   `status = 'critical-overload'`, `isCriticalOverload = true`
 *
 * @param assignedLoadDays - Assigned workload in days.
 * @param netCapacityDays - Net capacity in days.
 * @param thresholds - Status thresholds from application settings.
 * @returns Utilization percentage and domain status for the month.
 */
export function tauxUtilisation(
  assignedLoadDays: number,
  netCapacityDays: number,
  thresholds: UtilizationThresholds = DEFAULT_VISUAL_THRESHOLDS,
): UtilizationResult {
  if (netCapacityDays === 0 && assignedLoadDays === 0) {
    return {
      ratePercent: 0,
      status: classifyUtilizationStatus(0, thresholds),
      isCriticalOverload: false,
    };
  }

  if (netCapacityDays === 0 && assignedLoadDays > 0) {
    return {
      ratePercent: null,
      status: 'critical-overload',
      isCriticalOverload: true,
    };
  }

  const ratePercent = normalizeAmount((assignedLoadDays / netCapacityDays) * 100);
  const stableRatePercent = Number(ratePercent.toFixed(10));
  const status = classifyUtilizationStatus(stableRatePercent, thresholds);

  return {
    ratePercent: stableRatePercent,
    status,
    isCriticalOverload: status === 'critical-overload',
  };
}
