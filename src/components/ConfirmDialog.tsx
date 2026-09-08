import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  const confirmButtonClasses =
    tone === 'danger'
      ? 'bg-red-700 text-white hover:bg-red-600'
      : 'bg-[var(--color-bmx-blue)] text-white hover:opacity-90';

  return (
    <div
      aria-labelledby="confirm-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-6 shadow-2xl">
        <h2 className="text-xl font-semibold" id="confirm-dialog-title">
          {title}
        </h2>
        <div className="mt-3 text-sm text-[var(--text-secondary)]">{description}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm font-medium"
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`rounded-md px-4 py-2 text-sm font-medium ${confirmButtonClasses}`}
            disabled={busy}
            onClick={() => {
              void onConfirm();
            }}
            type="button"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
