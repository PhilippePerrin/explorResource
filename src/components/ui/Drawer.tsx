import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

import { X } from '@/components/icons';

import { IconButton } from './IconButton';

export interface DrawerProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  widthClassName?: string;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({
  open,
  title,
  description,
  headerActions,
  children,
  widthClassName = 'sm:max-w-xl',
  onClose,
}: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const firstFocusable =
      contentRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }

      const focusableElements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );

      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div aria-hidden="false" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={`drawer-enter ui-shadow-lg absolute inset-y-0 right-0 flex h-full w-full flex-col overflow-y-auto border-l border-[var(--surf-divider)] bg-[var(--surf-800)] p-6 ${widthClassName}`}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <IconButton icon={X} label="Close panel" onClick={onClose} size="sm" />
          </div>
        </div>

        <div ref={contentRef}>{children}</div>
      </div>
    </div>
  );
}
