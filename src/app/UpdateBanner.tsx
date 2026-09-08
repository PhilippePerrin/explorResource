/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) {
    return null;
  }

  return (
    <div
      aria-live="assertive"
      className="fixed inset-x-0 bottom-4 z-50 mx-auto w-[min(42rem,calc(100%-2rem))] rounded-xl border border-[var(--color-bmx-gold)] bg-[var(--surf-800)] px-4 py-3 shadow-2xl"
      role="alert"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold">↻ Update available</p>
          <p className="text-sm text-[var(--text-secondary)]">
            A new version of the planner is ready. Reload to apply the update.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-md border border-[var(--surf-divider)] px-4 py-2 text-sm font-medium"
            onClick={() => {
              setNeedRefresh(false);
            }}
            type="button"
          >
            Later
          </button>
          <button
            className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              void updateServiceWorker(true);
            }}
            type="button"
          >
            Reload now
          </button>
        </div>
      </div>
    </div>
  );
}
