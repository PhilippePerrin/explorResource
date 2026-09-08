import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type FilterValue = string | number | boolean | readonly string[];
type FilterStorage = 'url' | 'local';

export interface FilterDefinition<TValue extends FilterValue> {
  defaultValue: TValue;
  param: string;
  storage?: FilterStorage;
  parse?: (values: readonly string[]) => TValue;
  serialize?: (value: TValue) => readonly string[];
}

export type FilterDefinitions<TState extends object> = {
  [TKey in keyof TState]: FilterDefinition<Extract<TState[TKey], FilterValue>>;
};

export interface FilterFavorite<TState extends object> {
  id: string;
  name: string;
  values: TState;
  updatedAt: string;
}

function isStringArrayValue(value: FilterValue): value is readonly string[] {
  return Array.isArray(value);
}

function readStoredJson<TValue>(storageKey: string, fallbackValue: TValue): TValue {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return fallbackValue;
    }

    return JSON.parse(rawValue) as TValue;
  } catch {
    return fallbackValue;
  }
}

function writeStoredJson(storageKey: string, value: unknown) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

function removeStoredValue(storageKey: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(storageKey);
}

function parseStoredValue<TValue extends FilterValue>(
  definition: FilterDefinition<TValue>,
  rawValue: unknown,
): TValue {
  if (typeof definition.parse === 'function' && typeof rawValue === 'string') {
    return definition.parse([rawValue]);
  }

  if (isStringArrayValue(definition.defaultValue)) {
    return (
      Array.isArray(rawValue)
        ? rawValue.filter((value): value is string => typeof value === 'string')
        : definition.defaultValue
    ) as TValue;
  }

  if (typeof definition.defaultValue === 'boolean') {
    return (typeof rawValue === 'boolean' ? rawValue : definition.defaultValue) as TValue;
  }

  if (typeof definition.defaultValue === 'number') {
    return (
      typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : definition.defaultValue
    ) as TValue;
  }

  return (typeof rawValue === 'string' ? rawValue : definition.defaultValue) as TValue;
}

function parseSearchParamValue<TValue extends FilterValue>(
  definition: FilterDefinition<TValue>,
  searchParams: URLSearchParams,
): TValue {
  const rawValues = searchParams.getAll(definition.param);

  if (rawValues.length === 0) {
    return definition.defaultValue;
  }

  if (typeof definition.parse === 'function') {
    return definition.parse(rawValues);
  }

  if (isStringArrayValue(definition.defaultValue)) {
    return rawValues as unknown as TValue;
  }

  if (typeof definition.defaultValue === 'boolean') {
    return (rawValues[0] === '1' || rawValues[0]?.toLowerCase() === 'true') as TValue;
  }

  if (typeof definition.defaultValue === 'number') {
    const parsedNumber = Number(rawValues[0]);
    return (Number.isFinite(parsedNumber) ? parsedNumber : definition.defaultValue) as TValue;
  }

  return (rawValues[0] ?? definition.defaultValue) as TValue;
}

function serializeFilterValue<TValue extends FilterValue>(
  definition: FilterDefinition<TValue>,
  value: TValue,
): readonly string[] {
  if (typeof definition.serialize === 'function') {
    return definition.serialize(value);
  }

  if (isStringArrayValue(value)) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? ['1'] : [];
  }

  if (value === definition.defaultValue || value === '') {
    return [];
  }

  return [String(value)];
}

function buildDefaultFilterState<TState extends object>(
  definitions: FilterDefinitions<TState>,
): TState {
  const typedDefinitions = Object.entries(definitions) as [string, FilterDefinition<FilterValue>][];
  const entries = typedDefinitions.map(([key, definition]) => [key, definition.defaultValue]);
  return Object.fromEntries(entries) as TState;
}

function buildCurrentStateStorageKey(pageKey: string) {
  return `resource-capacity-planner.filter-state.${pageKey}`;
}

export function buildFavoritesStorageKey(pageKey: string) {
  return `resource-capacity-planner.filter-favorites.${pageKey}`;
}

function buildLocalStorageState<TState extends object>(
  definitions: FilterDefinitions<TState>,
  state: TState,
) {
  const typedDefinitions = Object.entries(definitions) as [string, FilterDefinition<FilterValue>][];

  return typedDefinitions.reduce<Record<string, FilterValue>>((result, [key, definition]) => {
    if ((definition.storage ?? 'url') === 'local') {
      result[key] = state[key as keyof TState] as FilterValue;
    }

    return result;
  }, {});
}

export function parseFilterState<TState extends object>(
  definitions: FilterDefinitions<TState>,
  searchParams: URLSearchParams,
  storedLocalState: Record<string, unknown> = {},
): TState {
  const typedDefinitions = Object.entries(definitions) as [string, FilterDefinition<FilterValue>][];
  const entries = typedDefinitions.map(([key, definition]) => {
    if ((definition.storage ?? 'url') === 'local') {
      return [key, parseStoredValue(definition, storedLocalState[key])];
    }

    return [key, parseSearchParamValue(definition, searchParams)];
  });

  return Object.fromEntries(entries) as TState;
}

export function buildFilterSearchParams<TState extends object>(
  definitions: FilterDefinitions<TState>,
  state: TState,
  currentSearchParams = new URLSearchParams(),
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(currentSearchParams);
  const typedDefinitions = Object.entries(definitions) as [string, FilterDefinition<FilterValue>][];

  for (const [, definition] of typedDefinitions) {
    if ((definition.storage ?? 'url') === 'url') {
      nextSearchParams.delete(definition.param);
    }
  }

  for (const [key, definition] of typedDefinitions) {
    if ((definition.storage ?? 'url') === 'local') {
      continue;
    }

    const values = serializeFilterValue(definition, state[key as keyof TState] as FilterValue);

    for (const value of values) {
      nextSearchParams.append(definition.param, value);
    }
  }

  return nextSearchParams;
}

export function readFilterFavorites<TState extends object>(
  pageKey: string,
): FilterFavorite<TState>[] {
  return readStoredJson<FilterFavorite<TState>[]>(buildFavoritesStorageKey(pageKey), []);
}

export function writeFilterFavorites<TState extends object>(
  pageKey: string,
  favorites: readonly FilterFavorite<TState>[],
) {
  writeStoredJson(buildFavoritesStorageKey(pageKey), favorites);
}

export function upsertFilterFavorite<TState extends object>(
  favorites: readonly FilterFavorite<TState>[],
  name: string,
  values: TState,
): FilterFavorite<TState>[] {
  const trimmedName = name.trim();

  if (trimmedName.length === 0) {
    return [...favorites];
  }

  const timestamp = new Date().toISOString();
  const existingFavorite = favorites.find(
    (favorite) =>
      favorite.name.localeCompare(trimmedName, undefined, { sensitivity: 'accent' }) === 0,
  );

  if (existingFavorite) {
    return favorites.map((favorite) =>
      favorite.id === existingFavorite.id
        ? {
            ...favorite,
            name: trimmedName,
            values,
            updatedAt: timestamp,
          }
        : favorite,
    );
  }

  return [
    ...favorites,
    {
      id: crypto.randomUUID(),
      name: trimmedName,
      values,
      updatedAt: timestamp,
    },
  ].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}

export function deleteFilterFavorite<TState extends object>(
  favorites: readonly FilterFavorite<TState>[],
  favoriteId: string,
): FilterFavorite<TState>[] {
  return favorites.filter((favorite) => favorite.id !== favoriteId);
}

export function usePersistentPageFilters<TState extends object>(
  pageKey: string,
  definitions: FilterDefinitions<TState>,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultFilters = useMemo(() => buildDefaultFilterState(definitions), [definitions]);
  const [storedLocalState, setStoredLocalState] = useState<Record<string, unknown>>(() =>
    readStoredJson<Record<string, unknown>>(buildCurrentStateStorageKey(pageKey), {}),
  );
  const [favorites, setFavorites] = useState<FilterFavorite<TState>[]>(() =>
    readFilterFavorites<TState>(pageKey),
  );

  const filters = useMemo(
    () => parseFilterState(definitions, searchParams, storedLocalState),
    [definitions, searchParams, storedLocalState],
  );

  useEffect(() => {
    const localState = buildLocalStorageState(definitions, filters);
    const storageKey = buildCurrentStateStorageKey(pageKey);

    if (Object.keys(localState).length === 0) {
      removeStoredValue(storageKey);
      return;
    }

    writeStoredJson(storageKey, localState);
  }, [definitions, filters, pageKey]);

  const replaceFilters = useCallback(
    (nextFilters: TState) => {
      setStoredLocalState(buildLocalStorageState(definitions, nextFilters));
      const nextSearchParams = buildFilterSearchParams(definitions, nextFilters, searchParams);
      setSearchParams(nextSearchParams, { replace: true });
    },
    [definitions, searchParams, setSearchParams],
  );

  const updateFilter = useCallback(
    <TKey extends keyof TState>(key: TKey, value: TState[TKey]) => {
      replaceFilters({
        ...filters,
        [key]: value,
      });
    },
    [filters, replaceFilters],
  );

  const resetFilters = useCallback(() => {
    replaceFilters(defaultFilters);
  }, [defaultFilters, replaceFilters]);

  const saveFavorite = useCallback(
    (name: string) => {
      const nextFavorites = upsertFilterFavorite(favorites, name, filters);
      setFavorites(nextFavorites);
      writeFilterFavorites(pageKey, nextFavorites);
    },
    [favorites, filters, pageKey],
  );

  const applyFavorite = useCallback(
    (favoriteId: string) => {
      const favorite = favorites.find((candidate) => candidate.id === favoriteId);

      if (!favorite) {
        return;
      }

      replaceFilters(favorite.values);
    },
    [favorites, replaceFilters],
  );

  const removeFavorite = useCallback(
    (favoriteId: string) => {
      const nextFavorites = deleteFilterFavorite(favorites, favoriteId);
      setFavorites(nextFavorites);
      writeFilterFavorites(pageKey, nextFavorites);
    },
    [favorites, pageKey],
  );

  return {
    filters,
    favorites,
    updateFilter,
    replaceFilters,
    resetFilters,
    saveFavorite,
    applyFavorite,
    removeFavorite,
  };
}
