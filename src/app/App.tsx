import { Suspense, lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from './AppShell';

const DashboardPage = lazy(() =>
  import('@/features/dashboard').then((module) => ({ default: module.DashboardPage })),
);
const CapacityCommandCenterPage = lazy(() =>
  import('@/features/capacity').then((module) => ({
    default: module.CapacityCommandCenterPage,
  })),
);
const DemandCoverageBoardPage = lazy(() =>
  import('@/features/demand-coverage').then((module) => ({
    default: module.DemandCoverageBoardPage,
  })),
);
const AllocationStudioPage = lazy(() =>
  import('@/features/allocation-studio').then((module) => ({
    default: module.AllocationStudioPage,
  })),
);
const ProjectsPage = lazy(() =>
  import('@/features/projects').then((module) => ({ default: module.ProjectsPage })),
);
const GroupsPage = lazy(() =>
  import('@/features/projects').then((module) => ({ default: module.GroupsPage })),
);
const ReleasesPage = lazy(() =>
  import('@/features/releases').then((module) => ({ default: module.ReleasesPage })),
);
const ResourcesPage = lazy(() =>
  import('@/features/resources').then((module) => ({ default: module.ResourcesPage })),
);
const NonWorkingDaysPage = lazy(() =>
  import('@/features/non-working-days').then((module) => ({
    default: module.NonWorkingDaysPage,
  })),
);
const WorkingDaysPage = lazy(() =>
  import('@/features/working-days').then((module) => ({ default: module.WorkingDaysPage })),
);
const ImportsPage = lazy(() =>
  import('@/features/imports').then((module) => ({ default: module.ImportsPage })),
);
const ResourceImportPage = lazy(() =>
  import('@/features/resource-import').then((module) => ({ default: module.ResourceImportPage })),
);
const CompaniesPage = lazy(() =>
  import('@/features/companies').then((module) => ({ default: module.CompaniesPage })),
);
const ResourceTypesPage = lazy(() =>
  import('@/features/resource-types').then((module) => ({
    default: module.ResourceTypesPage,
  })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings').then((module) => ({ default: module.SettingsPage })),
);

/**
 * Root application shell.
 *
 * A HashRouter is used deliberately: GitHub Pages serves static files and has
 * no server-side rewrite for deep links, so hash-based routing avoids 404s on
 * refresh/direct navigation under the `/explorResource/` base path.
 */
export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppShell>
        <Suspense
          fallback={
            <div
              aria-live="polite"
              className="mx-auto w-full max-w-7xl rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] px-6 py-4 text-sm"
              role="status"
            >
              Loading page…
            </div>
          }
        >
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
            <Route path="/resources/import" element={<ResourceImportPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/resource-types" element={<ResourceTypesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </AppShell>
    </HashRouter>
  );
}
