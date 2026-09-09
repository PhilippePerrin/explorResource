import { useEffect, useState, type ReactNode } from 'react';

import { openPlannerDb } from '@/persistence/db';

type Status = 'checking' | 'ready' | 'unavailable';

/**
 * Gates rendering until the local SQLite database has actually opened.
 *
 * The production database lives behind an OPFS SyncAccessHandle Pool, which
 * only one connection can hold at a time — if this app is already open in
 * another tab or window, opening it here will fail. There is no multi-tab
 * sync to fall back to (this app is single-user, single-machine by design),
 * so the only honest thing to do is tell the person clearly rather than let
 * every page fail silently on its first read.
 */
export function DatabaseLockGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;

    async function checkReady() {
      try {
        const db = await openPlannerDb();
        await db.getAll('appSettings');
        if (!cancelled) {
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setStatus('unavailable');
        }
      }
    }

    void checkReady();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'checking') {
    return (
      <div
        aria-live="polite"
        className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-4 text-sm"
        role="status"
      >
        Opening local database…
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div
        aria-live="assertive"
        className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 py-4 text-center text-sm"
        role="alert"
      >
        <p className="text-base font-semibold">Unable to open the local database.</p>
        <p>
          This usually means the application is already open in another tab or window. Close it
          there, then reload this page.
        </p>
        <button
          className="rounded-lg border border-[var(--surf-divider)] px-4 py-2 font-medium"
          onClick={() => window.location.reload()}
          type="button"
        >
          Reload
        </button>
      </div>
    );
  }

  return children;
}
