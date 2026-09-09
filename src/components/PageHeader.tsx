import type { ReactNode } from 'react';

import type { LucideIcon } from '@/components/icons';
import { IconChip } from '@/components/ui';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  descriptionClassName?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  icon,
  title,
  description,
  descriptionClassName = 'max-w-3xl',
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="relative flex items-start gap-3 overflow-hidden rounded-2xl">
        <div
          aria-hidden="true"
          className="bg-hexfield pointer-events-none absolute inset-0"
          style={{
            maskImage: 'linear-gradient(120deg, black, transparent 65%)',
            WebkitMaskImage: 'linear-gradient(120deg, black, transparent 65%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full opacity-25 blur-3xl"
          style={{
            background:
              'linear-gradient(135deg, var(--color-bmx-blue) 0%, var(--color-bmx-cyan) 100%)',
          }}
        />
        <IconChip className="relative" icon={icon} size="lg" tone="accent" />
        <div className="relative space-y-2">
          <h1 className="text-3xl font-semibold">{title}</h1>
          <p className={`text-sm text-[var(--text-secondary)] ${descriptionClassName}`}>
            {description}
          </p>
        </div>
      </div>
      {actions ? <div className="flex flex-none flex-wrap items-end gap-3">{actions}</div> : null}
    </header>
  );
}
