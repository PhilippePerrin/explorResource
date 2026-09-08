import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';

/**
 * Root application shell.
 *
 * A HashRouter is used deliberately: GitHub Pages serves static files and has
 * no server-side rewrite for deep links, so hash-based routing avoids 404s on
 * refresh/direct navigation under the `/explorResource/` base path.
 *
 * Feature pages are added lot by lot (see plan.md / AGENTS.md). This shell
 * only wires navigation and layout for now.
 */
function DashboardPlaceholder() {
  return (
    <main id="main-content">
      <h1>Resource Capacity &amp; Project Demand Planner</h1>
      <p>
        Application shell initialized. Feature pages (Dashboard, Capacity Command Center, Demand
        Coverage Board, Allocation Studio, Projects, Releases, Resources, Non-working Days, Working
        Days, Imports, Demand Evolution, Companies, Settings) are implemented incrementally — see{' '}
        <code>ai.memory</code> for current lot status.
      </p>
    </main>
  );
}

export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <a className="sr-only" href="#main-content">
        Skip to main content
      </a>
      <header>
        <nav aria-label="Primary">
          <NavLink to="/">Dashboard</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<DashboardPlaceholder />} />
      </Routes>
    </HashRouter>
  );
}
