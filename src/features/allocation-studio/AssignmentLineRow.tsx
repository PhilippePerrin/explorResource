import { useDraggable } from '@dnd-kit/core';

import { GripVertical, Pencil, Trash2 } from '@/components/icons';
import { formatDayAmount } from '@/components/formatDayAmount';
import { IconButton } from '@/components/ui';

import { AllocationAssignmentCell } from './AllocationAssignmentCell';
import type { AllocationAssignmentCellProps } from './AllocationAssignmentCell';
import type { AllocationStudioAssignmentRow } from './allocationStudioModel';

export interface AssignmentLineRowProps {
  row: AllocationStudioAssignmentRow;
  visibleMonths: readonly number[];
  year: number;
  rowIndex: number;
  displayPrecision: number;
  onCommitCell: (month: number, allocatedDays: number) => void;
  onRequestUnassign: () => void;
  onGridKeyDown: AllocationAssignmentCellProps['onGridKeyDown'];
}

/**
 * One row per resource assigned to a (project, resourceType) block. The grip
 * handle is the drag source for moving this resource's allocation to another
 * project (single-month, same as the previous per-chip drag) — replacing the
 * chip that used to render stacked inside the demand-line cell.
 */
export function AssignmentLineRow({
  row,
  visibleMonths,
  year,
  rowIndex,
  displayPrecision,
  onCommitCell,
  onRequestUnassign,
  onGridKeyDown,
}: AssignmentLineRowProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `assignment-${row.resourceId}-${row.projectCode}-${row.resourceTypeId}`,
    data: {
      kind: 'existing-allocation',
      resourceId: row.resourceId,
      projectCode: row.projectCode,
      resourceTypeId: row.resourceTypeId,
    },
  });

  return (
    <tr className="border-b border-[var(--surf-divider)] align-top">
      <td className="sticky left-0 z-10 w-[180px] bg-[var(--surf-800)] px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            aria-label={`Drag to move ${row.resourceName}'s allocation to another project`}
            className="inline-flex items-center rounded p-1 hover:bg-[var(--surf-600)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bmx-blue)]"
            ref={setNodeRef}
            style={
              transform
                ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
                : undefined
            }
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" size={14} />
          </button>
          {/*
            Lives in this sticky, always-on-top column (not the "Resource"
            column further right) so it stays reachable without scrolling
            back — and so it never sits in the region where the "Activity"
            sticky column visually overlaps the non-sticky columns whenever
            the table's auto layout gives any column more width than its
            hardcoded sticky offset assumes.
          */}
          <IconButton
            className="shrink-0 text-[var(--text-secondary)] hover:text-red-300"
            icon={Trash2}
            label={`Unassign ${row.resourceName} from ${row.projectCode}`}
            size="sm"
            onClick={onRequestUnassign}
          />
        </div>
      </td>
      <td className="sticky left-[180px] z-10 w-[160px] bg-[var(--surf-800)] px-3 py-2 text-[var(--text-secondary)]">
        {row.resourceTypeLabel}
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1">
          <Pencil aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" size={14} />
          {row.resourceName}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-[var(--text-secondary)]">
        {formatDayAmount(row.totalSupplyDays, displayPrecision)} d
      </td>
      <td className="px-3 py-2 text-right text-[var(--text-secondary)]">
        {formatDayAmount(row.totalDemandDays, displayPrecision)} d
      </td>
      {visibleMonths.map((month, monthIndex) => {
        const cell = row.months[month - 1];

        return (
          <td className="px-3 py-2" key={month}>
            <AllocationAssignmentCell
              allocatedDays={cell?.allocatedDays ?? 0}
              displayPrecision={displayPrecision}
              label={cell?.label ?? String(month)}
              month={month}
              monthIndex={monthIndex}
              projectCode={row.projectCode}
              resourceName={row.resourceName}
              resourceTypeId={row.resourceTypeId}
              rowIndex={rowIndex}
              year={year}
              onCommit={(allocatedDays) => onCommitCell(month, allocatedDays)}
              onGridKeyDown={onGridKeyDown}
            />
          </td>
        );
      })}
    </tr>
  );
}
