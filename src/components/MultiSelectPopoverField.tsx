import { useEffect, useId, useRef, useState } from 'react';

import { ChevronDown, Search, X } from '@/components/icons';

export interface MultiSelectPopoverOption {
  value: string;
  label: string;
}

export interface MultiSelectPopoverFieldProps {
  label: string;
  fieldKey: string;
  values: readonly string[];
  options: readonly MultiSelectPopoverOption[];
  onChange: (values: string[]) => void;
  searchPlaceholder?: string;
}

/**
 * A compact stand-in for a checkbox-pill fieldset when the option list can
 * be long: a fixed-height trigger button summarizing the selection, opening
 * an anchored panel with a search box, select-all/clear, and the real
 * checkbox list. Closes on outside click or Escape, returning focus to the
 * trigger (mirrors Drawer's focus-return, scoped to this popover instead of
 * a full focus trap, since Tab should still be free to move past it).
 */
export function MultiSelectPopoverField({
  label,
  fieldKey,
  values,
  options,
  onChange,
  searchPlaceholder = 'Search…',
}: MultiSelectPopoverFieldProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearchTerm('');
    }
  }, [open]);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );
  const summary =
    values.length === 0
      ? `All ${label.toLowerCase()}`
      : `${values.length} ${label.toLowerCase()} selected`;

  return (
    <div className="flex min-w-[14rem] flex-1 items-center gap-2" ref={containerRef}>
      <span className="w-28 shrink-0 text-sm font-medium" id={`filter-${fieldKey}-label`}>
        {label}
      </span>
      <div className="relative flex-1">
        <button
          aria-controls={panelId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`${label}: ${summary}`}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-[var(--color-bmx-blue)]"
          id={`filter-${fieldKey}`}
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown aria-hidden="true" className="shrink-0" size={16} />
        </button>

        {open ? (
          <div
            aria-label={label}
            className="ui-shadow-md absolute left-0 top-full z-30 mt-1 w-full min-w-[16rem] rounded-md border border-[var(--surf-divider)] bg-[var(--surf-800)] p-2"
            id={panelId}
            role="group"
          >
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                size={14}
              />
              <input
                aria-label={`Search ${label.toLowerCase()}`}
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] py-1.5 pl-7 pr-2 text-sm"
                placeholder={searchPlaceholder}
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <div className="mt-2 flex gap-2">
              <button
                className="text-xs text-[var(--color-bmx-blue)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--text-secondary)] disabled:no-underline"
                disabled={filteredOptions.length === 0}
                type="button"
                onClick={() => onChange([...new Set([...values, ...filteredOptions.map((o) => o.value)])])}
              >
                Select all
              </button>
              <button
                className="inline-flex items-center gap-1 text-xs text-[var(--color-bmx-blue)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--text-secondary)] disabled:no-underline"
                disabled={values.length === 0}
                type="button"
                onClick={() => onChange([])}
              >
                <X aria-hidden="true" size={12} />
                Clear
              </button>
            </div>

            <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <li className="px-2 py-1.5 text-sm text-[var(--text-secondary)]">No match.</li>
              ) : (
                filteredOptions.map((option) => {
                  const checked = values.includes(option.value);

                  return (
                    <li key={option.value}>
                      <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--surf-700)]">
                        <input
                          checked={checked}
                          type="checkbox"
                          onChange={(event) => {
                            const nextValues = event.target.checked
                              ? [...values, option.value]
                              : values.filter((value) => value !== option.value);
                            onChange(nextValues);
                          }}
                        />
                        <span className="truncate">{option.label}</span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
