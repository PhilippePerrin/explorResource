import type { ThemePreference } from '@/domain/entities';

const STORAGE_KEY = 'plannerThemePreference';

let mediaQueryCleanup: (() => void) | null = null;

function readStoredPreference(): ThemePreference {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return preference;
}

export function applyTheme(preference: ThemePreference): void {
  mediaQueryCleanup?.();
  mediaQueryCleanup = null;

  document.documentElement.setAttribute('data-theme', resolveTheme(preference));
  window.localStorage.setItem(STORAGE_KEY, preference);

  if (preference !== 'system') {
    return;
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    document.documentElement.setAttribute('data-theme', mediaQuery.matches ? 'dark' : 'light');
  };

  mediaQuery.addEventListener('change', handleChange);
  mediaQueryCleanup = () => mediaQuery.removeEventListener('change', handleChange);
}

export function bootstrapTheme(): void {
  applyTheme(readStoredPreference());
}
