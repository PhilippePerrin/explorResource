export interface SkeletonProps {
  /** Accessible loading text — keep byte-identical to the text it replaces. */
  label: string;
  lines?: number;
  className?: string;
}

export function Skeleton({ label, lines = 3, className = '' }: SkeletonProps) {
  // No role="status"/aria-live here: role="status" is reserved app-wide for
  // FeedbackMessage's live region. Pages render both side by side, and
  // FeedbackMessage unmounts (message === '') right when a reload kicks off,
  // so a second role="status" here would race screen.findByRole('status') in
  // tests — matching this transient loading node instead of the final
  // feedback banner. The label stays plain visible text, same a11y footprint
  // as the bare <p>Loading …</p> it replaces.
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          aria-hidden="true"
          className="skeleton-pulse h-4 rounded-md bg-[var(--surf-700)]"
          key={index}
          style={{ width: `${100 - index * 14}%` }}
        />
      ))}
    </div>
  );
}
