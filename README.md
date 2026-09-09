# Resource Capacity & Project Demand Planner

Local-first Progressive Web App for a single **Domain Manager** to plan team capacity, track project demand, and allocate resources — with no backend, no login, and full offline support after first load.

## Status

Under incremental construction, lot by lot. See [`ai.memory`](./ai.memory) for the current status and [`AGENTS.md`](./AGENTS.md) for the full agent-facing specification.

## Tech stack

React 18 · TypeScript (strict) · Vite · Tailwind CSS v4 · React Router (Hash) · SQLite (`@sqlite.org/sqlite-wasm`, WebAssembly/OPFS) · Zod · React Hook Form · TanStack Table/Virtual · Recharts · `@dnd-kit` · Vitest · React Testing Library · Playwright · ESLint · Prettier · GitHub Actions.

## Getting started

```bash
npm install
npm run dev
```

## Quality commands

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test:e2e
npm run build
```

## Documentation

Start at [`docs/index.md`](./docs/index.md) for the full documentation map (product vision, business rules, data model, architecture, import format, persistence & backup, PWA & hosting, testing strategy, accessibility, security & privacy, deployment, troubleshooting, traceability matrix, ADRs).

## Data & privacy

All business data is stored **locally in the browser** (SQLite, WebAssembly, persisted via OPFS). No data is ever sent to a server. Backups are plain JSON files exported/imported manually by the Domain Manager. See [`docs/security-and-privacy.md`](./docs/security-and-privacy.md).

## Hosting

Served as static files by a local server — no GitHub Pages, no cloud hosting. See [`docs/deployment.md`](./docs/deployment.md).

## License

Internal bioMérieux tool — no public license granted.
