import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useDroppable } from '@dnd-kit/core';

import { formatDayAmount } from '@/components/formatDayAmount';

export interface AllocationAssignmentCellProps {
  resourceName: string;
  allocatedDays: number;
  projectCode: string;
  resourceTypeId: string;
  year: number;
  month: number;
  label: string;
  rowIndex: number;
  monthIndex: number;
  displayPrecision: number;
  onActivate: () => void;
  onGridKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * Per-resource, per-month cell for an assignment row. Shares the same
 * drop::project::type::year::month id as AllocationBoardCell (the
 * demand-line cell) so both rows are equivalent single-month drop targets
 * for a "move" drag; this cell renders a plain day value rather than a
 * coverage bar, since a single resource's allocation has no gap of its own.
 */
export function AllocationAssignmentCell({
  resourceName,
  allocatedDays,
  projectCode,
  resourceTypeId,
  year,
  month,
  label,
  rowIndex,
  monthIndex,
  displayPrecision,
  onActivate,
  onGridKeyDown,
}: AllocationAssignmentCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop::${projectCode}::${resourceTypeId}::${year}::${month}`,
  });
  const formattedDays = formatDayAmount(allocatedDays, displayPrecision);

  return (
    <div
      className={`min-w-[8rem] rounded-lg border p-2 text-xs ${
        isOver
          ? 'border-[var(--color-bmx-blue)] bg-[var(--surf-600)]'
          : 'border-[var(--surf-divider)] bg-[var(--surf-700)]'
      }`}
      ref={setNodeRef}
    >
      <button
        aria-label={`${resourceName} in ${projectCode}, month ${label}: ${
          allocatedDays > 0 ? `${formattedDays} d` : 'no allocation'
        }. Press Enter or Space to edit.`}
        className="w-full rounded-md border border-transparent p-1 text-right hover:border-[var(--surf-divider)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bmx-blue)]"
        data-grid-cell="true"
        data-month-index={monthIndex}
        data-row-index={rowIndex}
        type="button"
        onClick={onActivate}
        onKeyDown={onGridKeyDown}
      >
        {allocatedDays > 0 ? `${formattedDays} d` : '—'}
      </button>
    </div>
  );
}
