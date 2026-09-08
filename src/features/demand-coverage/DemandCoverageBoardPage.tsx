import { useEffect, useMemo, useRef, useState } from 'react';

import { DemandCoverageBadge } from '@/components/DemandCoverageBadge';
import { FeedbackMessage } from '@/components/FeedbackMessage';
import { FilterBar, type FilterBarField } from '@/components/FilterBar';
import type { DemandCoverageState } from '@/domain/calculations';
import type { Allocation, DemandSnapshot, Project, ResourceType } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';
import { usePersistentPageFilters, type FilterDefinitions } from '@/features/filters/filterState';

import { buildDemandCoverageRows, type DemandCoverageRow } from './demandCoverageModel';

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

interface DemandCoverageFilters {
  year: number;
  projectSearch: string;
  resourceTypeFilter: string;
  projectCodesFilter: readonly string[];
  coverageStateFilter: 'all' | DemandCoverageState;
}

function formatDayAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value);
}

function buildCoverageTooltip(
  summary: Pick<
    DemandCoverageRow['months'][number],
    'demandDays' | 'allocatedDays' | 'remainingDemandDays' | 'overServiceDays'
  >,
): string {
  return `Demand ${formatDayAmount(summary.demandDays)} d, covered ${formatDayAmount(summary.allocatedDays)} d, gap ${formatDayAmount(summary.remainingDemandDays)} d, over-service ${formatDayAmount(summary.overServiceDays)} d.`;
}

function buildCoverageRatePercent(demandDays: number, allocatedDays: number) {
  if (demandDays === 0) {
    return 100;
  }

  return Math.min(100, (allocatedDays / demandDays) * 100);
}

export function DemandCoverageBoardPage() {
  const initialYear = useRef(new Date().getFullYear()).current;
  const [data, setData] = useState<DemandCoverageData>({
    projects: [],
    resourceTypes: [],
    allocations: [],
    demandSnapshots: [],
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const loadRequestIdRef = useRef(0);
  const filterDefinitions = useMemo<FilterDefinitions<DemandCoverageFilters>>(
    () => ({
      year: { defaultValue: initialYear, param: 'year' },
      projectSearch: { defaultValue: '', param: 'q' },
      resourceTypeFilter: { defaultValue: 'all', param: 'type' },
      projectCodesFilter: { defaultValue: [], param: 'project' },
      coverageStateFilter: { defaultValue: 'all', param: 'coverage' },
    }),
    [initialYear],
  );
  const {
    filters,
    favorites,
    updateFilter,
    resetFilters,
    saveFavorite,
    applyFavorite,
    removeFavorite,
  } = usePersistentPageFilters('demand-coverage-board', filterDefinitions);

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
    const years = new Set<number>([filters.year]);
    for (const snapshot of data.demandSnapshots) years.add(snapshot.year);
    return [...years].sort((left, right) => left - right);
  }, [data.demandSnapshots, filters.year]);
  const projectFilterOptions = useMemo(
    () =>
      [...data.projects]
        .sort((left, right) =>
          left.code.localeCompare(right.code, undefined, { sensitivity: 'base' }),
        )
        .map((project) => ({
          value: project.code,
          label: `${project.code} — ${project.name}`,
        })),
    [data.projects],
  );
  const rows = useMemo(
    () =>
      buildDemandCoverageRows({
        projects: data.projects,
        resourceTypes: data.resourceTypes,
        demandSnapshots: data.demandSnapshots,
        allocations: data.allocations,
        year: filters.year,
        projectSearch: filters.projectSearch,
        projectCodesFilter: filters.projectCodesFilter,
        resourceTypeFilter: filters.resourceTypeFilter,
        coverageStateFilter: filters.coverageStateFilter,
      }),
    [
      data.allocations,
      data.demandSnapshots,
      data.projects,
      data.resourceTypes,
      filters.coverageStateFilter,
      filters.projectCodesFilter,
      filters.projectSearch,
      filters.resourceTypeFilter,
      filters.year,
    ],
  );
  const filterFields = useMemo<FilterBarField[]>(
    () => [
      {
        type: 'single-select',
        key: 'year',
        label: 'Year',
        value: String(filters.year),
        options: yearOptions.map((optionYear) => ({
          value: String(optionYear),
          label: String(optionYear),
        })),
        onChange: (value) => updateFilter('year', Number(value)),
      },
      {
        type: 'search',
        key: 'projectSearch',
        label: 'Project search',
        value: filters.projectSearch,
        placeholder: 'Code or name',
        onChange: (value) => updateFilter('projectSearch', value),
      },
      {
        type: 'single-select',
        key: 'resourceTypeFilter',
        label: 'Resource type',
        value: filters.resourceTypeFilter,
        options: [
          { value: 'all', label: 'All resource types' },
          ...data.resourceTypes.map((resourceType) => ({
            value: resourceType.id,
            label: resourceType.label,
          })),
        ],
        onChange: (value) => updateFilter('resourceTypeFilter', value),
      },
      {
        type: 'single-select',
        key: 'coverageStateFilter',
        label: 'Coverage state',
        value: filters.coverageStateFilter,
        options: [
          { value: 'all', label: 'All states' },
          { value: 'covered', label: 'Covered' },
          { value: 'uncovered', label: 'Uncovered' },
          { value: 'over-served', label: 'Over-served' },
          { value: 'mixed', label: 'Mixed' },
        ],
        onChange: (value) =>
          updateFilter(
            'coverageStateFilter',
            value as DemandCoverageFilters['coverageStateFilter'],
          ),
      },
      {
        type: 'multi-select',
        key: 'projectCodesFilter',
        label: 'Projects',
        values: filters.projectCodesFilter,
        options: projectFilterOptions,
        onChange: (value) => updateFilter('projectCodesFilter', value),
      },
    ],
    [
      data.resourceTypes,
      filters.coverageStateFilter,
      filters.projectCodesFilter,
      filters.projectSearch,
      filters.resourceTypeFilter,
      filters.year,
      projectFilterOptions,
      updateFilter,
      yearOptions,
    ],
  );

  return (
    <div
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

      <FeedbackMessage message={feedback} />

      <FilterBar
        favorites={favorites}
        fields={filterFields}
        onApplyFavorite={applyFavorite}
        onDeleteFavorite={removeFavorite}
        onReset={resetFilters}
        onSaveFavorite={saveFavorite}
        resultsSummary={`${rows.length} board row(s)`}
      />

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
                        new Date(filters.year, index, 1),
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
                      <div className="mb-2">
                        <DemandCoverageBadge
                          compact
                          summary={{
                            coverageRatePercent: buildCoverageRatePercent(
                              row.totalDemandDays,
                              row.totalAllocatedDays,
                            ),
                            remainingDemandDays: row.totalRemainingDemandDays,
                            overServiceDays: row.totalOverServiceDays,
                          }}
                          tooltip={buildCoverageTooltip({
                            demandDays: row.totalDemandDays,
                            allocatedDays: row.totalAllocatedDays,
                            remainingDemandDays: row.totalRemainingDemandDays,
                            overServiceDays: row.totalOverServiceDays,
                          })}
                        />
                      </div>
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
                          <div className="mb-2">
                            <DemandCoverageBadge
                              compact
                              summary={cell}
                              tooltip={buildCoverageTooltip(cell)}
                            />
                          </div>
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
    </div>
  );
}
