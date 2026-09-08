import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FilterBar } from '@/components/FilterBar';
import {
  buildFavoritesStorageKey,
  buildFilterSearchParams,
  parseFilterState,
  readFilterFavorites,
  upsertFilterFavorite,
  writeFilterFavorites,
  deleteFilterFavorite,
  type FilterDefinitions,
} from '@/features/filters/filterState';

interface TestFilters {
  search: string;
  status: string;
  projects: readonly string[];
  localOnlySearch: string;
}

const definitions: FilterDefinitions<TestFilters> = {
  search: { defaultValue: '', param: 'q' },
  status: { defaultValue: 'all', param: 'status' },
  projects: { defaultValue: [], param: 'project' },
  localOnlySearch: { defaultValue: '', param: 'local', storage: 'local' },
};

describe('FilterBar and filter persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('serializes URL-backed filters and restores local-only values from storage', () => {
    const searchParams = buildFilterSearchParams(definitions, {
      search: 'E0100',
      status: 'active',
      projects: ['E0100', 'E0200'],
      localOnlySearch: 'Alice Martin',
    });

    expect(searchParams.toString()).toBe('q=E0100&status=active&project=E0100&project=E0200');

    const parsed = parseFilterState(definitions, searchParams, {
      localOnlySearch: 'Alice Martin',
    });

    expect(parsed).toEqual({
      search: 'E0100',
      status: 'active',
      projects: ['E0100', 'E0200'],
      localOnlySearch: 'Alice Martin',
    });
  });

  it('persists favorites in localStorage helpers', () => {
    const storageKey = buildFavoritesStorageKey('resources');
    const initialFavorites = upsertFilterFavorite([], 'Active external', {
      search: '',
      status: 'active',
      projects: [],
      localOnlySearch: 'Alice',
    });

    writeFilterFavorites('resources', initialFavorites);
    const storedFavorites = readFilterFavorites<TestFilters>('resources');

    expect(window.localStorage.getItem(storageKey)).not.toBeNull();
    expect(storedFavorites).toHaveLength(1);
    expect(storedFavorites[0]?.name).toBe('Active external');

    const updatedFavorites = upsertFilterFavorite(storedFavorites, 'Active external', {
      search: 'DEV',
      status: 'active',
      projects: ['E0100'],
      localOnlySearch: 'Alice Martin',
    });
    const trimmedFavorites = deleteFilterFavorite(updatedFavorites, updatedFavorites[0]!.id);

    expect(updatedFavorites[0]?.values).toEqual({
      search: 'DEV',
      status: 'active',
      projects: ['E0100'],
      localOnlySearch: 'Alice Martin',
    });
    expect(trimmedFavorites).toHaveLength(0);
  });

  it('saves and reapplies favorites through the shared UI', async () => {
    const user = userEvent.setup();
    const saves: string[] = [];
    const applied: string[] = [];
    const deleted: string[] = [];

    render(
      <FilterBar
        favorites={[
          {
            id: 'favorite-1',
            name: 'Focus projects',
            values: {
              search: 'E0100',
              status: 'active',
              projects: ['E0100'],
              localOnlySearch: '',
            },
            updatedAt: '2026-09-08T00:00:00.000Z',
          },
        ]}
        fields={[
          {
            type: 'search',
            key: 'search',
            label: 'Search',
            value: 'E0100',
            onChange: () => undefined,
          },
        ]}
        onApplyFavorite={(favoriteId) => applied.push(favoriteId)}
        onDeleteFavorite={(favoriteId) => deleted.push(favoriteId)}
        onReset={() => undefined}
        onSaveFavorite={(name) => saves.push(name)}
        resultsSummary="1 row"
      />,
    );

    await user.type(screen.getByLabelText(/Save current filters as favorite/i), 'Pinned view');
    await user.click(screen.getByRole('button', { name: /Save favorite/i }));
    await user.selectOptions(screen.getByLabelText(/Saved favorites/i), 'favorite-1');
    await user.click(screen.getByRole('button', { name: /Apply favorite/i }));
    await user.click(screen.getByRole('button', { name: /Delete favorite/i }));

    expect(saves).toEqual(['Pinned view']);
    expect(applied).toEqual(['favorite-1']);
    expect(deleted).toEqual(['favorite-1']);
  });
});
