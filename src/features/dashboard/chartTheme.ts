export const CHART_LINE_COLORS = {
  netCapacity: 'var(--color-bmx-blue)',
  allocatedLoad: 'var(--color-bmx-gold)',
  uncoveredDemand: '#ef4444',
} as const;

export const CHART_GRID_COLOR = 'var(--surf-divider)';
export const CHART_AXIS_COLOR = 'var(--text-secondary)';

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--surf-800)',
  border: '1px solid var(--surf-divider)',
  borderRadius: '0.5rem',
  color: 'var(--text-primary)',
  fontSize: '0.8125rem',
} as const;

export const CHART_LEGEND_STYLE = {
  color: 'var(--text-secondary)',
  fontSize: '0.8125rem',
} as const;
