import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'on-first-retry',
  },
  webServer: {
    // Built with --mode e2e so VITE_E2E_TEST_HOOKS is compiled in (see
    // .env.e2e and src/testHooks.ts) — the release build served by Rebex
    // Tiny Web Server never sets this.
    command: 'tsc -b && vite build --mode e2e && vite preview --port 4173',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
