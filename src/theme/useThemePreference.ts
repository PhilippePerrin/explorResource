import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppSettings, ThemePreference } from '@/domain/entities';
import { resolveAppSettings } from '@/features/settings/settingsUtils';
import { createRepository } from '@/persistence/repository';

import { applyTheme } from './applyTheme';

const appSettingsRepository = createRepository('appSettings');

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [loading, setLoading] = useState(true);
  const userOverrideRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await appSettingsRepository.getById('app-settings');
      if (cancelled || userOverrideRef.current) {
        return;
      }

      const resolved = resolveAppSettings(stored ?? null);
      setPreference(resolved.themePreference);
      applyTheme(resolved.themePreference);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const updatePreference = useCallback(async (next: ThemePreference) => {
    userOverrideRef.current = true;
    applyTheme(next);
    setPreference(next);
    setLoading(false);

    const stored = await appSettingsRepository.getById('app-settings');
    const nextSettings: AppSettings = {
      ...resolveAppSettings(stored ?? null),
      themePreference: next,
    };
    await appSettingsRepository.put(nextSettings);
  }, []);

  return { preference, loading, updatePreference };
}
