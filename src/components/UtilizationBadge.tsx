import { memo } from 'react';

import type { UtilizationResult, UtilizationStatus } from '@/domain/calculations';

function formatValue(value: number, displayPrecision: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: displayPrecision,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, displayPrecision),
  }).format(value);
}

function getUtilizationDescriptor(status: UtilizationStatus) {
  switch (status) {
    case 'available':
      return {
        icon: '\u25CB',
        label: 'Available',
        classes: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100',
      };
    case 'used':
      return {
        icon: '\u25D4',
        label: 'Used',
        classes: 'border-amber-500/40 bg-amber-950/30 text-amber-100',
      };
    case 'overload':
      return {
        icon: '\u26A0',
        label: 'Overload',
        classes: 'border-orange-500/40 bg-orange-950/30 text-orange-100',
      };
    case 'critical-overload':
      return {
        icon: '\u26D4',
        label: 'Critical overload',
        classes: 'border-red-500/40 bg-red-950/30 text-red-100',
      };
  }
}

interface UtilizationBadgeProps {
  utilization: UtilizationResult;
  displayPrecision?: number;
  tooltip: string;
  compact?: boolean;
}

function UtilizationBadgeComponent({
  utilization,
  displayPrecision = 1,
  tooltip,
  compact = false,
}: UtilizationBadgeProps) {
  const descriptor = getUtilizationDescriptor(utilization.status);
  const valueText =
    utilization.ratePercent === null
      ? 'critical'
      : `${formatValue(utilization.ratePercent, displayPrecision)}%`;

  return (
    <span
      aria-label={`${descriptor.label}. ${tooltip}`}
      className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-medium ${descriptor.classes} ${compact ? 'whitespace-nowrap' : ''}`}
      title={tooltip}
    >
      <span aria-hidden="true">{descriptor.icon}</span>
      <span>{descriptor.label}</span>
      <span>{valueText}</span>
    </span>
  );
}

export const UtilizationBadge = memo(UtilizationBadgeComponent);
