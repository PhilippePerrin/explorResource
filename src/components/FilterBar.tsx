import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import type { FilterFavorite } from '@/features/filters/filterState';

interface FilterOption {
  value: string;
  label: string;
}

interface SearchField {
  type: 'search';
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

interface SingleSelectField {
  type: 'single-select';
  key: string;
  label: string;
  value: string;
  options: readonly FilterOption[];
  onChange: (value: string) => void;
}

interface MultiSelectField {
  type: 'multi-select';
  key: string;
  label: string;
  values: readonly string[];
  options: readonly FilterOption[];
  onChange: (value: string[]) => void;
}

interface BooleanField {
  type: 'boolean';
  key: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export type FilterBarField = SearchField | SingleSelectField | MultiSelectField | BooleanField;

interface FilterBarProps<TState extends object> {
  fields: readonly FilterBarField[];
  favorites: readonly FilterFavorite<TState>[];
  onApplyFavorite: (favoriteId: string) => void;
  onDeleteFavorite: (favoriteId: string) => void;
  onReset: () => void;
  onSaveFavorite: (name: string) => void;
  resultsSummary?: string;
}

function fieldContainerClasses(extraClasses = '') {
  return `rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-3 ${extraClasses}`.trim();
}

export function FilterBar<TState extends object>({
  fields,
  favorites,
  onApplyFavorite,
  onDeleteFavorite,
  onReset,
  onSaveFavorite,
  resultsSummary,
}: FilterBarProps<TState>) {
  const [favoriteName, setFavoriteName] = useState('');
  const [selectedFavoriteId, setSelectedFavoriteId] = useState('');

  useEffect(() => {
    if (selectedFavoriteId.length === 0) {
      return;
    }

    if (!favorites.some((favorite) => favorite.id === selectedFavoriteId)) {
      setSelectedFavoriteId('');
    }
  }, [favorites, selectedFavoriteId]);

  const columnClassName =
    fields.length >= 4
      ? 'xl:grid-cols-4'
      : fields.length === 3
        ? 'lg:grid-cols-3'
        : 'md:grid-cols-2';

  return (
    <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
      <div className={`grid gap-3 ${columnClassName}`}>
        {fields.map((field) => {
          if (field.type === 'search') {
            return (
              <label
                className={fieldContainerClasses()}
                htmlFor={`filter-${field.key}`}
                key={field.key}
              >
                <span className="text-sm font-medium">{field.label}</span>
                <input
                  className="mt-2 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                  id={`filter-${field.key}`}
                  placeholder={field.placeholder}
                  type="search"
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                />
              </label>
            );
          }

          if (field.type === 'single-select') {
            return (
              <label
                className={fieldContainerClasses()}
                htmlFor={`filter-${field.key}`}
                key={field.key}
              >
                <span className="text-sm font-medium">{field.label}</span>
                <select
                  className="mt-2 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                  id={`filter-${field.key}`}
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          if (field.type === 'boolean') {
            return (
              <label
                className={`${fieldContainerClasses('flex items-center gap-3')} justify-between`}
                htmlFor={`filter-${field.key}`}
                key={field.key}
              >
                <span className="text-sm font-medium">{field.label}</span>
                <input
                  checked={field.checked}
                  className="h-4 w-4"
                  id={`filter-${field.key}`}
                  type="checkbox"
                  onChange={(event) => field.onChange(event.target.checked)}
                />
              </label>
            );
          }

          return (
            <fieldset className={fieldContainerClasses()} key={field.key}>
              <legend className="text-sm font-medium">{field.label}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {field.options.map((option) => {
                  const checked = field.values.includes(option.value);

                  return (
                    <label
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--surf-divider)] px-3 py-1.5 text-sm"
                      key={option.value}
                    >
                      <input
                        checked={checked}
                        type="checkbox"
                        onChange={(event) => {
                          const nextValues = event.target.checked
                            ? [...field.values, option.value]
                            : field.values.filter((value) => value !== option.value);
                          field.onChange(nextValues);
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_auto]">
        <div className="grid gap-3 md:grid-cols-[minmax(10rem,16rem)_auto_auto]">
          <label className={fieldContainerClasses()} htmlFor="filter-favorite-name">
            <span className="text-sm font-medium">Save current filters as favorite</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className="min-w-[12rem] flex-1 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="filter-favorite-name"
                placeholder="e.g. Active delivery projects"
                type="text"
                value={favoriteName}
                onChange={(event) => setFavoriteName(event.target.value)}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  onSaveFavorite(favoriteName);
                  setFavoriteName('');
                }}
              >
                Save favorite
              </Button>
            </div>
          </label>

          <label className={fieldContainerClasses()} htmlFor="filter-favorite-select">
            <span className="text-sm font-medium">Saved favorites</span>
            <select
              className="mt-2 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
              id="filter-favorite-select"
              value={selectedFavoriteId}
              onChange={(event) => setSelectedFavoriteId(event.target.value)}
            >
              <option value="">Select a favorite</option>
              {favorites.map((favorite) => (
                <option key={favorite.id} value={favorite.id}>
                  {favorite.name}
                </option>
              ))}
            </select>
          </label>

          <div className={`${fieldContainerClasses('flex flex-wrap items-center gap-2')}`}>
            <Button
              disabled={selectedFavoriteId.length === 0}
              size="sm"
              variant="secondary"
              onClick={() => onApplyFavorite(selectedFavoriteId)}
            >
              Apply favorite
            </Button>
            <Button
              disabled={selectedFavoriteId.length === 0}
              size="sm"
              variant="danger"
              onClick={() => {
                onDeleteFavorite(selectedFavoriteId);
                setSelectedFavoriteId('');
              }}
            >
              Delete favorite
            </Button>
            <Button size="sm" variant="secondary" onClick={onReset}>
              Reset filters
            </Button>
          </div>
        </div>

        {resultsSummary ? (
          <div className="flex items-end justify-start lg:justify-end">
            <p className="text-sm text-[var(--text-secondary)]">{resultsSummary}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
