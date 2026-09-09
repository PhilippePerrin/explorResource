import { memo, type ReactNode } from 'react';

import type { LucideIcon } from '@/components/icons';
import { IconChip, type IconChipTone } from '@/components/ui/IconChip';

interface MetricCardProps {
  title: string;
  value: string;
  hint?: string;
  accent?: ReactNode;
  icon?: LucideIcon;
  tone?: IconChipTone;
  className?: string;
}

function MetricCardComponent({
  title,
  value,
  hint,
  accent,
  icon,
  tone = 'accent',
  className = '',
}: MetricCardProps) {
  return (
    <article
      className={`ui-shadow-sm rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon ? <IconChip icon={icon} size="md" tone={tone} /> : null}
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        </div>
        {accent ? <div className="text-xs text-[var(--text-secondary)]">{accent}</div> : null}
      </div>
      {hint ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{hint}</p> : null}
    </article>
  );
}

export const MetricCard = memo(MetricCardComponent);
