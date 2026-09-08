import { cloneElement, useId, useState, type KeyboardEvent, type ReactElement } from 'react';

export interface TooltipProps {
  content: string;
  children: ReactElement;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  function show() {
    setVisible(true);
  }

  function hide() {
    setVisible(false);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      setVisible(false);
    }
  }

  const trigger = cloneElement(children, {
    'aria-describedby': visible ? tooltipId : undefined,
    onBlur: hide,
    onFocus: show,
    onKeyDown: handleKeyDown,
    onMouseEnter: show,
    onMouseLeave: hide,
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      {visible ? (
        <span
          className="ui-shadow-md pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-2 py-1 text-xs text-[var(--text-primary)]"
          id={tooltipId}
          role="tooltip"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
