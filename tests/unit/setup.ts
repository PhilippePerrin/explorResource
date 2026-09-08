import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// jsdom does not implement matchMedia. Components that resolve the 'system'
// theme preference (src/theme/applyTheme.ts) call it unconditionally, so every
// test render needs a stand-in, not just theme-specific tests. This is a plain
// function (not vi.fn()) so `vi.restoreAllMocks()` in individual test files
// can't wipe it back to returning undefined.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

// jsdom always reports 0 for offsetHeight/offsetWidth (no real layout engine), which makes
// @tanstack/react-virtual measure a zero-height viewport. It then renders zero virtual items and
// falls back to rendering every row unvirtualized - correct for tiny lists, but for large synthetic
// datasets (e.g. the 200-resource capacity heatmap test) this renders every row as real DOM and can
// be slow/flaky under CI contention. Stubbing a realistic fixed viewport size lets the virtualizer
// behave deterministically in tests the same way it does in real browsers.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() {
    return 600;
  },
});
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get() {
    return 800;
  },
});
