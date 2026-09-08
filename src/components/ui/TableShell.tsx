import type { ReactNode } from 'react';

export interface TableShellProps {
  caption: string;
  captionVisible?: boolean;
  children: ReactNode;
  className?: string;
  zebra?: boolean;
  stickyHeader?: boolean;
}

export function TableShell({
  caption,
  captionVisible = false,
  children,
  className = '',
  zebra = false,
  stickyHeader = false,
}: TableShellProps) {
  const tableClasses = [
    'w-full border-collapse text-sm',
    zebra ? 'ui-table-zebra' : '',
    stickyHeader ? 'ui-table-sticky-header' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`overflow-auto rounded-xl border border-[var(--surf-divider)] ${className}`}>
      <table className={tableClasses}>
        <caption className={captionVisible ? 'p-3 text-left text-sm font-medium' : 'sr-only'}>
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}
