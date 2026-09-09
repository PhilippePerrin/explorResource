import type { ReactNode } from 'react';

import type { LucideIcon } from '@/components/icons';
import { IconChip, type IconChipTone } from './IconChip';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: IconChipTone;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-3 px-6 py-10 text-center ${className}`}>
      <IconChip icon={icon} size="lg" tone={tone} />
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
