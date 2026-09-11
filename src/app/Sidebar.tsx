import { useEffect, useState } from 'react';
import { NavLink, type NavLinkRenderProps } from 'react-router-dom';

import { Menu, X } from '@/components/icons';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';

import { NAV_GROUPS } from './nav';

const COLLAPSE_STORAGE_KEY = 'plannerSidebarCollapsed';

function readStoredCollapsed(): boolean {
  return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
}

function abbreviate(label: string): string {
  const letters = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '');

  return letters.join('') || label.slice(0, 2).toUpperCase();
}

function navLinkClassName({ isActive }: NavLinkRenderProps): string {
  return `flex items-center gap-2 rounded-md border-l-2 px-2 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'border-[var(--color-bmx-cyan)] bg-[var(--status-info-bg)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--status-info-border)]'
      : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surf-700)]'
  }`;
}

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <>
      {mobileOpen ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-[var(--backdrop)] md:hidden"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={`sidebar-collapse-transition fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--surf-divider)] bg-[var(--surf-800)] ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:sticky md:top-0 md:h-dvh md:translate-x-0`}
      >
        <nav aria-label="Primary" className="order-2 flex-1 overflow-y-auto p-2">
          {NAV_GROUPS.map((group) => (
            <div className="mb-4" key={group.label}>
              <p
                className={
                  collapsed
                    ? 'sr-only'
                    : 'mb-1 px-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase'
                }
              >
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip content={item.label}>
                        <NavLink
                          className={navLinkClassName}
                          end={item.to === '/'}
                          onClick={onCloseMobile}
                          to={item.to}
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current text-[0.65rem] font-semibold"
                          >
                            {abbreviate(item.label)}
                          </span>
                          <span className="sr-only">{item.label}</span>
                        </NavLink>
                      </Tooltip>
                    ) : (
                      <NavLink
                        className={navLinkClassName}
                        end={item.to === '/'}
                        onClick={onCloseMobile}
                        to={item.to}
                      >
                        {item.label}
                      </NavLink>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/*
          Rendered after <nav> so Tab from the skip link reaches the primary nav
          links immediately, before these collapse/close controls; order-1 keeps
          it visually pinned to the top of the sidebar.
        */}
        <div className="order-1 flex items-center justify-between gap-2 border-b border-[var(--surf-divider)] p-3">
          {collapsed ? (
            <span className="sr-only">Capacity Planner</span>
          ) : (
            <p className="truncate text-sm font-semibold">Capacity Planner</p>
          )}
          <div className="flex items-center gap-1">
            <IconButton
              className="md:hidden"
              icon={X}
              label="Close navigation"
              onClick={onCloseMobile}
              size="sm"
            />
            <IconButton
              className="hidden md:inline-flex"
              icon={Menu}
              label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              onClick={() => setCollapsed((value) => !value)}
              size="sm"
            />
          </div>
        </div>
      </aside>
    </>
  );
}
