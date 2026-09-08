import { useRef, type KeyboardEvent } from 'react';

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export function Tabs({ items, value, onChange, label }: TabsProps) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function selectIndex(index: number) {
    const nextIndex = (index + items.length) % items.length;
    const item = items[nextIndex];

    if (!item) {
      return;
    }

    onChange(item.value);
    buttonRefs.current[item.value]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        selectIndex(index + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        selectIndex(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        selectIndex(0);
        break;
      case 'End':
        event.preventDefault();
        selectIndex(items.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      aria-label={label}
      className="inline-flex gap-1 rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-1"
      role="tablist"
    >
      {items.map((item, index) => {
        const selected = item.value === value;

        return (
          <button
            aria-selected={selected}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? 'bg-[var(--color-bmx-blue)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surf-600)]'
            }`}
            key={item.value}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              buttonRefs.current[item.value] = node;
            }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
