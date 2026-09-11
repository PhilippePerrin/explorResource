import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import type { FilterFavorite } from '@/features/filters/filterState';

import { MultiSelectPopoverField } from './MultiSelectPopoverField';

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

interface MultiSelectPopoverFilterField {
  type: 'multi-select-popover';
  key: string;
  label: string;
  values: readonly string[];
  options: readonly FilterOption[];
  onChange: (value: string[]) => void;
  searchPlaceholder?: string;
}

export type FilterBarField =
  | SearchField
  | SingleSelectField
  | MultiSelectField
  | BooleanField
  | MultiSelectPopoverFilterField;

interface FilterBarProps<TState extends object> {
  fields: readonly FilterBarField[];
  favorites: readonly FilterFavorite<TState>[];
  onApplyFavorite: (favoriteId: string) => void;
  onDeleteFavorite: (favoriteId: string) => void;
  onReset: () => void;
  onSaveFavorite: (name: string) => void;
  resultsSummary?: string;
}

function fieldRowClasses(extraClasses = '') {
  return `flex min-w-[14rem] flex-1 items-center gap-2 ${extraClasses}`.trim();
}

function fieldLabelClasses() {
  return 'w-28 shrink-0 text-sm font-medium';
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
  const [favoritesOpen, setFavoritesOpen] = useState(false);

  useEffect(() => {
    if (selectedFavoriteId.length === 0) {
      return;
    }

    if (!favorites.some((favorite) => favorite.id === selectedFavoriteId)) {
      setSelectedFavoriteId('');
    }
  }, [favorites, selectedFavoriteId]);

  return (
    <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {fields.map((field) => {
          if (field.type === 'search') {
            return (
              <div className={fieldRowClasses()} key={field.key}>
                <label className={fieldLabelClasses()} htmlFor={`filter-${field.key}`}>
                  {field.label}
                </label>
                <input
                  className="w-full flex-1 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-1.5"
                  id={`filter-${field.key}`}
                  placeholder={field.placeholder}
                  type="search"
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                />
              </div>
            );
          }

          if (field.type === 'single-select') {
            return (
              <div className={fieldRowClasses()} key={field.key}>
                <label className={fieldLabelClasses()} htmlFor={`filter-${field.key}`}>
                  {field.label}
                </label>
                <select
                  className="w-full flex-1 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-1.5"
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
              </div>
            );
          }

          if (field.type === 'boolean') {
            return (
              <label
                className="flex min-w-[10rem] items-center gap-2 text-sm font-medium"
                htmlFor={`filter-${field.key}`}
                key={field.key}
              >
                <input
                  checked={field.checked}
                  className="h-4 w-4"
                  id={`filter-${field.key}`}
                  type="checkbox"
                  onChange={(event) => field.onChange(event.target.checked)}
                />
                <span>{field.label}</span>
              </label>
            );
          }

          if (field.type === 'multi-select-popover') {
            return (
              <MultiSelectPopoverField
                fieldKey={field.key}
                key={field.key}
                label={field.label}
                options={field.options}
                searchPlaceholder={field.searchPlaceholder}
                values={field.values}
                onChange={field.onChange}
              />
            );
          }

          return (
            <fieldset className={fieldRowClasses('flex-wrap')} key={field.key}>
              <legend className={fieldLabelClasses()}>{field.label}</legend>
              <div className="flex flex-1 flex-wrap gap-2">
                {field.options.map((option) => {
                  const checked = field.values.includes(option.value);

                  return (
                    <label
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--surf-divider)] px-3 py-1 text-sm"
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

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          aria-expanded={favoritesOpen}
          className="text-sm font-medium text-[var(--color-bmx-blue)] hover:underline"
          type="button"
          onClick={() => setFavoritesOpen((current) => !current)}
        >
          {favoritesOpen ? '▾' : '▸'} Favorites
        </button>

        {resultsSummary ? (
          <p className="text-sm text-[var(--text-secondary)]">{resultsSummary}</p>
        ) : null}
      </div>

      {favoritesOpen ? (
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(10rem,16rem)_auto_auto]">
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
      ) : null}
    </section>
  );
}
