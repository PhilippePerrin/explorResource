import { memo } from 'react';

import { AlertTriangle, Ban, Circle, CircleDot } from '@/components/icons';
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
        Icon: Circle,
        label: 'Available',
        classes:
          'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
      };
    case 'used':
      return {
        Icon: CircleDot,
        label: 'Used',
        classes:
          'border-[var(--status-caution-border)] bg-[var(--status-caution-bg)] text-[var(--status-caution-text)]',
      };
    case 'overload':
      return {
        Icon: AlertTriangle,
        label: 'Overload',
        classes:
          'border-[var(--status-attention-border)] bg-[var(--status-attention-bg)] text-[var(--status-attention-text)]',
      };
    case 'critical-overload':
      return {
        Icon: Ban,
        label: 'Critical overload',
        classes:
          'border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-text)]',
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
      <descriptor.Icon aria-hidden="true" size={14} strokeWidth={2.25} />
      <span>{descriptor.label}</span>
      <span>{valueText}</span>
    </span>
  );
}

export const UtilizationBadge = memo(UtilizationBadgeComponent);
