/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from 'virtual:pwa-register/react';

import { RotateCcw } from '@/components/icons';
import { Button, IconChip } from '@/components/ui';

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
      className="ui-shadow-lg fixed inset-x-0 bottom-4 z-50 mx-auto w-[min(42rem,calc(100%-2rem))] rounded-xl border border-[var(--color-bmx-gold)] bg-[var(--surf-800)] px-4 py-3"
      role="alert"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <IconChip icon={RotateCcw} size="sm" tone="accent" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">Update available</p>
            <p className="text-sm text-[var(--text-secondary)]">
              A new version of the planner is ready. Reload to apply the update.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setNeedRefresh(false);
            }}
          >
            Later
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              void updateServiceWorker(true);
            }}
          >
            Reload now
          </Button>
        </div>
      </div>
    </div>
  );
}
