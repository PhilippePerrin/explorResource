import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';

import { UpdateBanner } from './UpdateBanner';
import { AllocationStudioPage } from '@/features/allocation-studio';
import { CapacityCommandCenterPage } from '@/features/capacity';
import { CompaniesPage } from '@/features/companies';
import { DashboardPage } from '@/features/dashboard';
import { DemandCoverageBoardPage } from '@/features/demand-coverage';
import { ImportsPage } from '@/features/imports';
import { NonWorkingDaysPage } from '@/features/non-working-days';
import { GroupsPage, ProjectsPage } from '@/features/projects';
import { ReleasesPage } from '@/features/releases';
import { ResourceTypesPage } from '@/features/resource-types';
import { ResourcesPage } from '@/features/resources';
import { SettingsPage } from '@/features/settings';
import { WorkingDaysPage } from '@/features/working-days';

/**
 * Root application shell.
 *
 * A HashRouter is used deliberately: GitHub Pages serves static files and has
 * no server-side rewrite for deep links, so hash-based routing avoids 404s on
 * refresh/direct navigation under the `/explorResource/` base path.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/capacity', label: 'Capacity Command Center' },
  { to: '/demand-coverage', label: 'Demand Coverage Board' },
  { to: '/allocation-studio', label: 'Allocation Studio' },
  { to: '/projects', label: 'Projects' },
  { to: '/groups', label: 'Groups' },
  { to: '/releases', label: 'Releases' },
  { to: '/resources', label: 'Resources' },
  { to: '/non-working-days', label: 'Non-working Days' },
  { to: '/working-days', label: 'Working Days' },
  { to: '/imports', label: 'Imports' },
  { to: '/companies', label: 'Companies' },
  { to: '/resource-types', label: 'Resource Types' },
  { to: '/settings', label: 'Settings' },
] as const;

export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <a className="sr-only" href="#main-content">
        Skip to main content
      </a>
      <header>
        <h1 className="sr-only">Resource Capacity &amp; Project Demand Planner</h1>
        <nav aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <UpdateBanner />
      <main id="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/capacity" element={<CapacityCommandCenterPage />} />
          <Route path="/demand-coverage" element={<DemandCoverageBoardPage />} />
          <Route path="/allocation-studio" element={<AllocationStudioPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/releases" element={<ReleasesPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/non-working-days" element={<NonWorkingDaysPage />} />
          <Route path="/working-days" element={<WorkingDaysPage />} />
          <Route path="/imports" element={<ImportsPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/resource-types" element={<ResourceTypesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
