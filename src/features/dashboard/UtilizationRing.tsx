import { memo } from 'react';

import type { UtilizationResult, UtilizationStatus } from '@/domain/calculations';

const STATUS_COLOR_VAR: Record<UtilizationStatus, string> = {
  available: 'var(--status-success-text)',
  used: 'var(--status-caution-text)',
  overload: 'var(--status-attention-text)',
  'critical-overload': 'var(--status-critical-text)',
};

const STROKE_WIDTH = 9;
const OVERFLOW_STROKE_WIDTH = 4;
const OVERFLOW_GAP = 3;

interface UtilizationRingProps {
  utilization: UtilizationResult;
  size?: number;
  className?: string;
}

function UtilizationRingComponent({
  utilization,
  size = 112,
  className = '',
}: UtilizationRingProps) {
  const center = size / 2;
  const radius = center - STROKE_WIDTH / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const overflowRadius = radius - STROKE_WIDTH / 2 - OVERFLOW_STROKE_WIDTH / 2 - OVERFLOW_GAP;
  const overflowCircumference = 2 * Math.PI * overflowRadius;
  const color = STATUS_COLOR_VAR[utilization.status];
  const percent = utilization.ratePercent;
  const filledPercent = percent === null ? 100 : Math.min(100, Math.max(0, percent));
  const overflowPercent = percent === null ? 0 : Math.min(100, Math.max(0, percent - 100));
  const filledOffset = circumference - (circumference * filledPercent) / 100;
  const overflowOffset = overflowCircumference - (overflowCircumference * overflowPercent) / 100;

  return (
    <div className={`ring-wrap ${className}`} style={{ width: size, height: size }}>
      <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke="var(--surf-divider)"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={filledOffset}
          strokeLinecap="round"
          strokeWidth={STROKE_WIDTH}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        />
        {overflowPercent > 0 ? (
          <circle
            cx={center}
            cy={center}
            fill="none"
            r={overflowRadius}
            stroke="var(--status-critical-text)"
            strokeDasharray={overflowCircumference}
            strokeDashoffset={overflowOffset}
            strokeLinecap="round"
            strokeWidth={OVERFLOW_STROKE_WIDTH}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        ) : null}
      </svg>
      <div className="ring-center">
        <b>{percent === null ? '—' : `${Math.round(percent)}%`}</b>
        <span>utilized</span>
      </div>
    </div>
  );
}

export const UtilizationRing = memo(UtilizationRingComponent);
