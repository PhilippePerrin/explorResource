import { memo, type ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string;
  hint?: string;
  accent?: ReactNode;
}

function MetricCardComponent({ title, value, hint, accent }: MetricCardProps) {
  return (
    <article className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
        {accent ? <div className="text-xs text-[var(--text-secondary)]">{accent}</div> : null}
      </div>
      {hint ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{hint}</p> : null}
    </article>
  );
}

export const MetricCard = memo(MetricCardComponent);
