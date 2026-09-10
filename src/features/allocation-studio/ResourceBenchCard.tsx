import { useDraggable } from '@dnd-kit/core';

import { formatDayAmount } from '@/components/formatDayAmount';
import { GripVertical } from '@/components/icons';
import { UtilizationBadge } from '@/components/UtilizationBadge';
import { getResourceFullName } from '@/domain/entities';

import type { ResourceBenchRow } from './allocationStudioModel';

export interface ResourceBenchCardProps {
  row: ResourceBenchRow;
  displayPrecision: number;
  isArmed: boolean;
  onArm: () => void;
}

/**
 * The card itself is the drag source (carries only resourceId — days/month
 * are decided at drop time), and is also a plain button so a mouse-free user
 * can "arm" it with Enter/Space instead of dragging.
 */
export function ResourceBenchCard({
  row,
  displayPrecision,
  isArmed,
  onArm,
}: ResourceBenchCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `bench-${row.resource.id}`,
    data: { kind: 'resource', resourceId: row.resource.id },
  });
  const resourceName = getResourceFullName(row.resource);

  return (
    <button
      className={`w-full rounded-lg border p-3 text-left text-xs transition-colors ${
        isArmed
          ? 'armed-resource-card'
          : 'border-[var(--surf-divider)] bg-[var(--surf-700)] hover:border-[var(--color-bmx-blue)]'
      }`}
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      type="button"
      onClick={onArm}
      {...attributes}
      {...listeners}
      aria-pressed={isArmed}
    >
      <div className="flex items-start gap-2">
        <GripVertical
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--text-secondary)]"
          size={14}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium" title={resourceName}>
              {resourceName}
            </p>
            <UtilizationBadge
              compact
              displayPrecision={displayPrecision}
              tooltip={`${resourceName}: ${formatDayAmount(
                row.summary.assignedLoadDays,
                displayPrecision,
              )} allocated days over ${formatDayAmount(row.summary.netCapacityDays, displayPrecision)} net capacity days.`}
              utilization={row.summary.utilization}
            />
          </div>
          <p className="truncate text-[var(--text-secondary)]" title={row.resourceTypeFullLabel}>
            {row.resourceTypeLabel}
          </p>
        </div>
      </div>
      {isArmed ? (
        <p className="mt-2 font-medium text-[var(--status-info-text)]">
          Armed — choose a project cell and press Enter or Space.
        </p>
      ) : null}
    </button>
  );
}
