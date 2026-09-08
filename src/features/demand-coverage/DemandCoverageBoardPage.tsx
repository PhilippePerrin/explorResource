import { useEffect, useMemo, useRef, useState } from 'react';

import type { Allocation, DemandSnapshot, Project, ResourceType } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';

import { buildDemandCoverageRows } from './demandCoverageModel';

const projectsRepository = createRepository('projects');
const resourceTypesRepository = createRepository('resourceTypes');
const allocationsRepository = createRepository('allocations');
const demandSnapshotsRepository = createRepository('demandSnapshots');

interface DemandCoverageData {
  projects: Project[];
  resourceTypes: ResourceType[];
  allocations: Allocation[];
  demandSnapshots: DemandSnapshot[];
}

function formatDayAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value);
}

export function DemandCoverageBoardPage() {
  const now = new Date();
  const [data, setData] = useState<DemandCoverageData>({
    projects: [],
    resourceTypes: [],
    allocations: [],
    demandSnapshots: [],
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [projectSearch, setProjectSearch] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [showOnlyGaps, setShowOnlyGaps] = useState(false);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const requestId = ++loadRequestIdRef.current;

    try {
      const [projects, resourceTypes, allocations, demandSnapshots] = await Promise.all([
        projectsRepository.getAll(),
        resourceTypesRepository.getAll(),
        allocationsRepository.getAll(),
        demandSnapshotsRepository.getAll(),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({ projects, resourceTypes, allocations, demandSnapshots });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to load demand coverage data.');
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  const yearOptions = useMemo(() => {
    const years = new Set<number>([year]);
    for (const snapshot of data.demandSnapshots) years.add(snapshot.year);
    return [...years].sort((left, right) => left - right);
  }, [data.demandSnapshots, year]);
  const rows = useMemo(
    () =>
      buildDemandCoverageRows({
        projects: data.projects,
        resourceTypes: data.resourceTypes,
        demandSnapshots: data.demandSnapshots,
        allocations: data.allocations,
        year,
        projectSearch,
        resourceTypeFilter,
        showOnlyGaps,
      }),
    [
      data.allocations,
      data.demandSnapshots,
      data.projects,
      data.resourceTypes,
      projectSearch,
      resourceTypeFilter,
      showOnlyGaps,
      year,
    ],
  );

  return (
    <main
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6"
      id="demand-coverage-board-page"
    >
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Demand Coverage Board</h1>
        <p className="max-w-4xl text-sm text-[var(--text-secondary)]">
          Project � resource-type coverage, with demand, covered load, remaining demand, and
          over-service shown side-by-side so nothing is silently netted out.
        </p>
      </header>

      <div aria-live="polite" className="sr-only">
        {feedback}
      </div>
      {feedback ? (
        <p
          className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-800)] px-4 py-3 text-sm"
          role="status"
        >
          {feedback}
        </p>
      ) : null}

      <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="text-sm font-medium" htmlFor="coverage-year">
            Year
            <select
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="coverage-year"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {yearOptions.map((optionYear) => (
                <option key={optionYear} value={optionYear}>
                  {optionYear}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="coverage-project-search">
            Project search
            <input
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="coverage-project-search"
              placeholder="Code or name"
              type="search"
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="coverage-resource-type">
            Resource type
            <select
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="coverage-resource-type"
              value={resourceTypeFilter}
              onChange={(event) => setResourceTypeFilter(event.target.value)}
            >
              <option value="all">All</option>
              {data.resourceTypes.map((resourceType) => (
                <option key={resourceType.id} value={resourceType.id}>
                  {resourceType.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[var(--surf-divider)] px-3 py-2 text-sm font-medium">
            <input
              checked={showOnlyGaps}
              onChange={(event) => setShowOnlyGaps(event.target.checked)}
              type="checkbox"
            />
            Show only rows with uncovered demand
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Coverage matrix</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Each monthly cell lists demand, covered load, remaining demand, and over-service.
            </p>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{rows.length} board row(s)</p>
        </div>

        {loading ? (
          <p>Loading demand coverage�</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No demand row matches the current filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--surf-divider)]">
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Project
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Resource type
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Totals
                  </th>
                  {Array.from({ length: 12 }, (_, index) => (
                    <th className="px-3 py-2 font-semibold" key={index + 1} scope="col">
                      {new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
                        new Date(year, index, 1),
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    className="border-b border-[var(--surf-divider)] align-top"
                    key={`${row.projectCode}-${row.resourceTypeId}`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.projectCode}</div>
                      <div className="text-[var(--text-secondary)]">{row.projectName}</div>
                    </td>
                    <td className="px-3 py-2">{row.resourceTypeLabel}</td>
                    <td className="px-3 py-2">
                      <ul className="space-y-1 text-xs">
                        <li>Demand {formatDayAmount(row.totalDemandDays)} d</li>
                        <li>Covered {formatDayAmount(row.totalAllocatedDays)} d</li>
                        <li>Gap {formatDayAmount(row.totalRemainingDemandDays)} d</li>
                        <li>Over-service {formatDayAmount(row.totalOverServiceDays)} d</li>
                      </ul>
                    </td>
                    {row.months.map((cell) => (
                      <td className="px-3 py-2" key={cell.month}>
                        <div className="min-w-[11rem] rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-2 text-xs">
                          <p className="font-medium">
                            Coverage {formatDayAmount(cell.coverageRatePercent)}%
                          </p>
                          <p>Demand {formatDayAmount(cell.demandDays)} d</p>
                          <p>Covered {formatDayAmount(cell.allocatedDays)} d</p>
                          <p>Gap {formatDayAmount(cell.remainingDemandDays)} d</p>
                          <p>Over-service {formatDayAmount(cell.overServiceDays)} d</p>
                          <p>Resources {cell.allocatedResourceCount}</p>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
