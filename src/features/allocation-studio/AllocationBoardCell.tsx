import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useDroppable } from '@dnd-kit/core';

import { DemandCoverageBadge } from '@/components/DemandCoverageBadge';

import { CoverageBar } from './CoverageBar';
import { buildCoverageBarCaption, type AllocationStudioCell } from './allocationStudioModel';

export interface AllocationBoardCellProps {
  cell: AllocationStudioCell;
  projectCode: string;
  projectName: string;
  resourceTypeId: string;
  year: number;
  rowIndex: number;
  monthIndex: number;
  displayPrecision: number;
  onActivate: () => void;
  onGridKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

export function AllocationBoardCell({
  cell,
  projectCode,
  projectName,
  resourceTypeId,
  year,
  rowIndex,
  monthIndex,
  displayPrecision,
  onActivate,
  onGridKeyDown,
}: AllocationBoardCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop::${projectCode}::${resourceTypeId}::${year}::${cell.month}`,
  });
  const caption = buildCoverageBarCaption(cell, displayPrecision);

  return (
    <div
      className={`min-w-[12rem] rounded-lg border p-2 text-xs ${
        isOver
          ? 'border-[var(--color-bmx-blue)] bg-[var(--surf-600)]'
          : 'border-[var(--surf-divider)] bg-[var(--surf-700)]'
      }`}
      ref={setNodeRef}
    >
      <button
        aria-label={`${projectCode} ${projectName}, month ${cell.label}. ${caption}. Press Enter or Space to open quick-assign.`}
        className="w-full rounded-md border border-transparent p-1 text-left hover:border-[var(--surf-divider)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bmx-blue)]"
        data-grid-cell="true"
        data-month-index={monthIndex}
        data-row-index={rowIndex}
        type="button"
        onClick={onActivate}
        onKeyDown={onGridKeyDown}
      >
        <CoverageBar displayPrecision={displayPrecision} summary={cell} />
        <div className="mt-2">
          <DemandCoverageBadge
            compact
            displayPrecision={displayPrecision}
            summary={cell}
            tooltip={caption}
          />
        </div>
      </button>
    </div>
  );
}
