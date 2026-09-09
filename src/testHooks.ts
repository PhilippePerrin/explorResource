import { createRepository } from '@/persistence/repository';
import { STORE_NAMES, type StoreName } from '@/persistence/sqlite/schema';

declare global {
  interface Window {
    __plannerTestSeed?: (recordsByStore: Partial<Record<StoreName, unknown[]>>) => Promise<void>;
  }
}

/**
 * Exposes a window hook that lets Playwright e2e tests seed fixture data
 * through the real repository layer (validated, same code path as the app
 * itself). Only compiled into the bundle when VITE_E2E_TEST_HOOKS=1 (see
 * .env.e2e and playwright.config.ts) — never present in the build shipped to
 * Rebex Tiny Web Server.
 *
 * Needed because the production database now lives behind a dedicated Worker
 * (OPFS), which Playwright's page.evaluate (main-thread only) cannot reach
 * directly the way it could reach IndexedDB before this migration.
 */
export function installTestHooksIfEnabled(): void {
  // Dot-notation access (not bracket notation) is required for Vite to
  // statically replace this with a literal and dead-code-eliminate the
  // function body in builds where the variable isn't set — see
  // docs/adr/0005-sqlite-wasm-and-rebex-hosting.md.
  if (import.meta.env.VITE_E2E_TEST_HOOKS !== '1') {
    return;
  }

  window.__plannerTestSeed = async (recordsByStore) => {
    for (const storeName of STORE_NAMES) {
      const records = recordsByStore[storeName];

      if (!records) {
        continue;
      }

      const repository = createRepository(storeName);

      for (const record of records) {
        await repository.put(record as never);
      }
    }
  };
}
