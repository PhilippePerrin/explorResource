import { Card } from '@/components/ui';

import { ResourceBenchCard } from './ResourceBenchCard';
import type { ResourceBenchRow } from './allocationStudioModel';

export interface ResourceBenchPanelProps {
  rows: readonly ResourceBenchRow[];
  displayPrecision: number;
  armedResourceId: string | null;
  onArm: (resourceId: string) => void;
  focusMonthLabel: string;
}

export function ResourceBenchPanel({
  rows,
  displayPrecision,
  armedResourceId,
  onArm,
  focusMonthLabel,
}: ResourceBenchPanelProps) {
  return (
    <Card>
      <h2 className="text-xl font-semibold">Resources</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Drag a resource onto a project cell to add supply, or select one and press Enter or Space on
        a cell. Sorted by availability in {focusMonthLabel}.
      </p>
      <ul className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-[var(--text-secondary)]">
            No active resource matches the current filters.
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.resource.id}>
              <ResourceBenchCard
                displayPrecision={displayPrecision}
                isArmed={armedResourceId === row.resource.id}
                row={row}
                onArm={() => onArm(row.resource.id)}
              />
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}
