import { memo } from 'react';

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
        icon: '✓',
        label: 'Covered',
        classes: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100',
      };
    case 'uncovered':
      return {
        icon: '⚠',
        label: 'Uncovered',
        classes: 'border-amber-500/40 bg-amber-950/30 text-amber-100',
      };
    case 'over-served':
      return {
        icon: '↗',
        label: 'Over-served',
        classes: 'border-orange-500/40 bg-orange-950/30 text-orange-100',
      };
    case 'mixed':
      return {
        icon: '◩',
        label: 'Mixed',
        classes: 'border-red-500/40 bg-red-950/30 text-red-100',
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
      <span aria-hidden="true">{descriptor.icon}</span>
      <span>{descriptor.label}</span>
      <span>{valueText}</span>
    </span>
  );
}

export const DemandCoverageBadge = memo(DemandCoverageBadgeComponent);
