import { memo } from 'react';

import { getUtilizationDescriptor } from '@/components/utilizationDescriptor';
import type { UtilizationResult } from '@/domain/calculations';

function formatValue(value: number, displayPrecision: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: displayPrecision,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, displayPrecision),
  }).format(value);
}

interface UtilizationBadgeProps {
  utilization: UtilizationResult;
  displayPrecision?: number;
  tooltip: string;
  compact?: boolean;
  className?: string;
  // Hides the visible status word, leaving only the icon + value — used in
  // dense grids (the capacity heatmap) where the full label per cell drifts
  // column widths. aria-label/title always keep the full status name, so
  // this is never the sole carrier of meaning (never-color-alone stays
  // satisfied by the icon shape, which still differs per status).
  showLabel?: boolean;
}

function UtilizationBadgeComponent({
  utilization,
  displayPrecision = 1,
  tooltip,
  compact = false,
  className = '',
  showLabel = true,
}: UtilizationBadgeProps) {
  const descriptor = getUtilizationDescriptor(utilization.status);
  const valueText =
    utilization.ratePercent === null
      ? 'critical'
      : `${formatValue(utilization.ratePercent, displayPrecision)}%`;

  return (
    <span
      aria-label={`${descriptor.label}. ${tooltip}`}
      className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-medium ${descriptor.classes} ${compact ? 'whitespace-nowrap' : ''} ${className}`}
      title={tooltip}
    >
      <descriptor.Icon aria-hidden="true" size={14} strokeWidth={2.25} />
      {showLabel ? <span>{descriptor.label}</span> : null}
      <span>{valueText}</span>
    </span>
  );
}

export const UtilizationBadge = memo(UtilizationBadgeComponent);
