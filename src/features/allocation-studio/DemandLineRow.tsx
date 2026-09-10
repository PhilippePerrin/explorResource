import { useDroppable } from '@dnd-kit/core';

import { Search } from '@/components/icons';
import { formatDayAmount } from '@/components/formatDayAmount';

import { AllocationBoardCell } from './AllocationBoardCell';
import type {
  AllocationStudioDemandLineRow,
  AllocationStudioRowStatus,
} from './allocationStudioModel';
import type { AllocationBoardCellProps } from './AllocationBoardCell';

const STATUS_LABELS: Record<AllocationStudioRowStatus, string> = {
  validated: 'Published',
  draft: 'Draft',
  cancelled: 'Cancelled',
  manual: 'Manual',
  mixed: 'Mixed',
  none: '—',
};

export interface DemandLineRowProps {
  row: AllocationStudioDemandLineRow;
  visibleMonths: readonly number[];
  year: number;
  rowIndex: number;
  displayPrecision: number;
  canAddAcrossMonths: boolean;
  onActivateCell: (month: number) => void;
  onAddAcrossMonths: () => void;
  onGridKeyDown: AllocationBoardCellProps['onGridKeyDown'];
}

/**
 * The aggregate (project, resourceType) row: search icon, not draggable —
 * shows Total supply/demand and per-month coverage cells. Individual
 * resources assigned to this row render as separate AssignmentLineRow(s)
 * beneath it, not as chips inside these cells. The whole row is also a
 * drop-row::project::type::year droppable, so dropping a bench resource
 * anywhere in the Status/Resource/Activity/Total columns (not just a month
 * cell) still adds it across every visible month — the smaller month-cell
 * droppables sit "in front" for collision purposes, so this only wins when
 * the drop lands outside of them.
 */
export function DemandLineRow({
  row,
  visibleMonths,
  year,
  rowIndex,
  displayPrecision,
  canAddAcrossMonths,
  onActivateCell,
  onAddAcrossMonths,
  onGridKeyDown,
}: DemandLineRowProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop-row::${row.projectCode}::${row.resourceTypeId}::${year}`,
  });

  return (
    <tr
      className={`border-b border-[var(--surf-divider)] align-top ${
        isOver ? 'bg-[var(--surf-600)]' : ''
      }`}
      ref={setNodeRef}
    >
      <td className="px-3 py-2 font-medium">{row.projectCode}</td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1">
          <Search aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" size={14} />
          {STATUS_LABELS[row.status]}
        </span>
      </td>
      <td className="px-3 py-2">
        <div title={row.resourceTypeFullLabel}>{row.resourceTypeLabel}</div>
        <button
          className="mt-1 text-left text-[11px] text-[var(--color-bmx-blue)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[var(--text-secondary)] disabled:no-underline"
          disabled={!canAddAcrossMonths}
          title={
            canAddAcrossMonths
              ? 'Add the armed resource across every visible month'
              : 'Arm a resource on the bench first'
          }
          type="button"
          onClick={onAddAcrossMonths}
        >
          Add across all visible months
        </button>
      </td>
      <td className="px-3 py-2">{row.projectName}</td>
      <td className="px-3 py-2 text-right">
        {formatDayAmount(row.totalSupplyDays, displayPrecision)} d
      </td>
      <td className="px-3 py-2 text-right">
        {formatDayAmount(row.totalDemandDays, displayPrecision)} d
      </td>
      {visibleMonths.map((month, monthIndex) => {
        const cell = row.months[month - 1];

        if (!cell) {
          return <td className="px-3 py-2" key={month} />;
        }

        return (
          <td className="px-3 py-2" key={month}>
            <AllocationBoardCell
              cell={cell}
              displayPrecision={displayPrecision}
              monthIndex={monthIndex}
              projectCode={row.projectCode}
              projectName={row.projectName}
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
