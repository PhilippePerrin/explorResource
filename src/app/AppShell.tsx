import { useState, type ReactNode } from 'react';

import { Menu } from '@/components/icons';
import { IconButton } from '@/components/ui/IconButton';

import { Sidebar } from './Sidebar';
import { UpdateBanner } from './UpdateBanner';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <a className="sr-only" href="#main-content">
        Skip to main content
      </a>

      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-[var(--surf-divider)] bg-[var(--surf-800)] px-4 py-3">
          <IconButton
            className="md:hidden"
            icon={Menu}
            label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            size="sm"
          />
          <p className="sr-only">Resource Capacity &amp; Project Demand Planner</p>
        </header>

        <UpdateBanner />

        <main className="flex-1" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
