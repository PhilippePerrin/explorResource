import { buildCoverageBarSegments, type DemandAllocationSummary } from '@/domain/calculations';

import { buildCoverageBarCaption } from './allocationStudioModel';

type CoverageBarSummary = Pick<
  DemandAllocationSummary,
  'demandDays' | 'allocatedDays' | 'remainingDemandDays' | 'overServiceDays'
>;

const SEGMENT_CLASS: Record<'covered' | 'gap' | 'over-service', string> = {
  covered: 'ui-coverage-bar-covered',
  gap: 'ui-coverage-bar-gap',
  'over-service': 'ui-coverage-bar-overservice',
};

export interface CoverageBarProps {
  summary: CoverageBarSummary;
  displayPrecision?: number;
}

/**
 * Compact visual stand-in for the four demand/supply numbers. Decorative
 * only (aria-hidden) — the caption text below it, plus the DemandCoverageBadge
 * rendered alongside it by callers, carry the accessible meaning.
 */
export function CoverageBar({ summary, displayPrecision = 1 }: CoverageBarProps) {
  const segments = buildCoverageBarSegments(summary);

  return (
    <div>
      <div aria-hidden="true" className="ui-coverage-bar">
        {segments.map((segment) => (
          <span
            className={SEGMENT_CLASS[segment.kind]}
            key={segment.kind}
            style={{ width: `${segment.widthPercent}%` }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {buildCoverageBarCaption(summary, displayPrecision)}
      </p>
    </div>
  );
}
