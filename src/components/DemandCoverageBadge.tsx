import { memo } from 'react';

import { AlertTriangle, ArrowUpRight, Check, Shuffle } from '@/components/icons';
import {
  classifyDemandCoverageState,
  type DemandAllocationSummary,
  type DemandCoverageState,
} from '@/domain/calculations';

function formatValue(value: number, displayPrecision: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: displayPrecision,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, displayPrecision),
  }).format(value);
}

function getDescriptor(state: DemandCoverageState) {
  switch (state) {
    case 'covered':
      return {
        Icon: Check,
        label: 'Covered',
        classes:
          'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
      };
    case 'uncovered':
      return {
        Icon: AlertTriangle,
        label: 'Uncovered',
        classes:
          'border-[var(--status-caution-border)] bg-[var(--status-caution-bg)] text-[var(--status-caution-text)]',
      };
    case 'over-served':
      return {
        Icon: ArrowUpRight,
        label: 'Over-served',
        classes:
          'border-[var(--status-attention-border)] bg-[var(--status-attention-bg)] text-[var(--status-attention-text)]',
      };
    case 'mixed':
      return {
        Icon: Shuffle,
        label: 'Mixed',
        classes:
          'border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-text)]',
      };
  }
}

function buildValueText(
  summary: Pick<
    DemandAllocationSummary,
    'coverageRatePercent' | 'remainingDemandDays' | 'overServiceDays'
  >,
  displayPrecision: number,
) {
  const state = classifyDemandCoverageState(summary);

  if (state === 'uncovered') {
    return `${formatValue(summary.remainingDemandDays, displayPrecision)} d gap`;
  }

  if (state === 'over-served') {
    return `${formatValue(summary.overServiceDays, displayPrecision)} d extra`;
  }

  if (state === 'mixed') {
    return `${formatValue(summary.remainingDemandDays, displayPrecision)} d / ${formatValue(summary.overServiceDays, displayPrecision)} d`;
  }

  return `${formatValue(summary.coverageRatePercent, displayPrecision)}%`;
}

interface DemandCoverageBadgeProps {
  summary: Pick<
    DemandAllocationSummary,
    'coverageRatePercent' | 'remainingDemandDays' | 'overServiceDays'
  >;
  displayPrecision?: number;
  tooltip: string;
  compact?: boolean;
}

function DemandCoverageBadgeComponent({
  summary,
  displayPrecision = 1,
  tooltip,
  compact = false,
}: DemandCoverageBadgeProps) {
  const state = classifyDemandCoverageState(summary);
  const descriptor = getDescriptor(state);
  const valueText = buildValueText(summary, displayPrecision);

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

export const DemandCoverageBadge = memo(DemandCoverageBadgeComponent);
