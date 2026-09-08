import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, bootstrapTheme } from '@/theme/applyTheme';

function mockMatchMedia(matchesDark: boolean) {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];

  const mediaQueryList = {
    matches: matchesDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.push(listener);
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQueryList as unknown as MediaQueryList);

  return { mediaQueryList, listeners };
}

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies light/dark preferences directly', () => {
    mockMatchMedia(false);

    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('resolves "system" via prefers-color-scheme', () => {
    mockMatchMedia(true);
    applyTheme('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('reacts to a system theme change while preference is "system"', () => {
    const { mediaQueryList, listeners } = mockMatchMedia(false);
    applyTheme('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    mediaQueryList.matches = true;
    listeners.forEach((listener) => listener({} as MediaQueryListEvent));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists the preference to localStorage and bootstrapTheme reapplies it', () => {
    mockMatchMedia(false);
    applyTheme('dark');
    expect(window.localStorage.getItem('plannerThemePreference')).toBe('dark');

    document.documentElement.removeAttribute('data-theme');
    bootstrapTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('falls back to "system" when localStorage has no valid cached preference', () => {
    mockMatchMedia(true);
    window.localStorage.setItem('plannerThemePreference', 'not-a-real-value');

    bootstrapTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
