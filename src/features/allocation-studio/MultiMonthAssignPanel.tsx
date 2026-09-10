import { DemandCoverageBadge } from '@/components/DemandCoverageBadge';
import { formatDayAmount } from '@/components/formatDayAmount';
import { Button, Drawer, TableShell } from '@/components/ui';

import { buildCoverageBarCaption, type AllocationBatchPreviewEntry } from './allocationStudioModel';

export interface MultiMonthAssignPanelProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  resourceName: string;
  projectCode: string;
  projectName: string;
  resourceTypeLabel: string;
  entries: readonly AllocationBatchPreviewEntry[];
  displayPrecision: number;
}

/**
 * Review-then-confirm panel shown when a resource is added across every
 * visible month at once (bench drop, or the row-level keyboard activator).
 * Kept separate from QuickAssignDrawer: that drawer is a react-hook-form
 * editor over a single record, while this is a fixed per-month review table
 * with one confirm action — different shapes, no reuse benefit beyond the
 * shared Drawer chrome, which is already its own primitive.
 */
export function MultiMonthAssignPanel({
  open,
  onClose,
  onConfirm,
  resourceName,
  projectCode,
  projectName,
  resourceTypeLabel,
  entries,
  displayPrecision,
}: MultiMonthAssignPanelProps) {
  return (
    <Drawer
      description={`Adding ${resourceName} to ${projectCode} — ${projectName} (${resourceTypeLabel}). Review the proposed days for each month before confirming.`}
      open={open}
      title="Add across all visible months"
      widthClassName="sm:max-w-2xl"
      onClose={onClose}
    >
      <TableShell caption={`Proposed monthly allocation for ${resourceName} on ${projectCode}`}>
        <thead>
          <tr className="border-b border-[var(--surf-divider)]">
            <th className="px-3 py-2 text-left font-semibold" scope="col">
              Month
            </th>
            <th className="px-3 py-2 text-right font-semibold" scope="col">
              Proposed days
            </th>
            <th className="px-3 py-2 text-left font-semibold" scope="col">
              Coverage before → after
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr className="border-b border-[var(--surf-divider)] align-top" key={entry.month}>
              <td className="px-3 py-2">{entry.label}</td>
              <td className="px-3 py-2 text-right">
                {formatDayAmount(entry.proposedAllocatedDays, displayPrecision)} d
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <DemandCoverageBadge
                    compact
                    displayPrecision={displayPrecision}
                    summary={entry.beforeDemandSummary}
                    tooltip={buildCoverageBarCaption(entry.beforeDemandSummary, displayPrecision)}
                  />
                  <span aria-hidden="true">→</span>
                  <DemandCoverageBadge
                    compact
                    displayPrecision={displayPrecision}
                    summary={entry.afterDemandSummary}
                    tooltip={buildCoverageBarCaption(entry.afterDemandSummary, displayPrecision)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>Queue change</Button>
      </div>
    </Drawer>
  );
}
