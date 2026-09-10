import { useDraggable } from '@dnd-kit/core';

import { GripVertical, Pencil } from '@/components/icons';
import { formatDayAmount } from '@/components/formatDayAmount';

import { AllocationAssignmentCell } from './AllocationAssignmentCell';
import type { AllocationAssignmentCellProps } from './AllocationAssignmentCell';
import type { AllocationStudioAssignmentRow } from './allocationStudioModel';

export interface AssignmentLineRowProps {
  row: AllocationStudioAssignmentRow;
  visibleMonths: readonly number[];
  year: number;
  rowIndex: number;
  displayPrecision: number;
  onActivateCell: (month: number) => void;
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
  onActivateCell,
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
      <td className="px-3 py-2">
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
      </td>
      <td className="px-3 py-2 text-[var(--text-secondary)]">—</td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1">
          <Pencil aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" size={14} />
          {row.resourceName}
        </span>
      </td>
      <td className="px-3 py-2">{row.projectName}</td>
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
              onActivate={() => onActivateCell(month)}
              onGridKeyDown={onGridKeyDown}
            />
          </td>
        );
      })}
    </tr>
  );
}
