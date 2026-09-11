import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { DemandCoverageBadge } from '@/components/DemandCoverageBadge';
import { FeedbackMessage } from '@/components/FeedbackMessage';
import { FilterBar, type FilterBarField } from '@/components/FilterBar';
import { formatDayAmount } from '@/components/formatDayAmount';
import { Target } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { Card, Drawer, TableShell } from '@/components/ui';
import type { DemandCoverageState } from '@/domain/calculations';
import {
  getResourceFullName,
  type Allocation,
  type DemandSnapshot,
  type Project,
  type Resource,
  type ResourceType,
} from '@/domain/entities';
import { createRepository } from '@/persistence/repository';
import { usePersistentPageFilters, type FilterDefinitions } from '@/features/filters/filterState';
import { getResourceTypeDisplayLabel } from '@/features/resource-types';

import { buildDemandCoverageRows, type DemandCoverageRow } from './demandCoverageModel';

const projectsRepository = createRepository('projects');
const resourceTypesRepository = createRepository('resourceTypes');
const resourcesRepository = createRepository('resources');
const allocationsRepository = createRepository('allocations');
const demandSnapshotsRepository = createRepository('demandSnapshots');

interface DemandCoverageData {
  projects: Project[];
  resourceTypes: ResourceType[];
  resources: Resource[];
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

interface SelectedCell {
  projectCode: string;
  projectName: string;
  resourceTypeId: string;
  resourceTypeLabel: string;
  month: number;
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
    resources: [],
    allocations: [],
    demandSnapshots: [],
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
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
      const [projects, resourceTypes, resources, allocations, demandSnapshots] = await Promise.all([
        projectsRepository.getAll(),
        resourceTypesRepository.getAll(),
        resourcesRepository.getAll(),
        allocationsRepository.getAll(),
        demandSnapshotsRepository.getAll(),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({ projects, resourceTypes, resources, allocations, demandSnapshots });
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
  const selectedCellSummary = useMemo(() => {
    if (!selectedCell) {
      return null;
    }

    const row = rows.find(
      (candidate) =>
        candidate.projectCode === selectedCell.projectCode &&
        candidate.resourceTypeId === selectedCell.resourceTypeId,
    );
    return row?.months[selectedCell.month - 1] ?? null;
  }, [rows, selectedCell]);
  const selectedAssignments = useMemo(() => {
    if (!selectedCell) {
      return [];
    }

    const resourceLookup = new Map(data.resources.map((resource) => [resource.id, resource]));

    return data.allocations
      .filter(
        (allocation) =>
          allocation.projectCode === selectedCell.projectCode &&
          allocation.resourceTypeId === selectedCell.resourceTypeId &&
          allocation.year === filters.year &&
          allocation.month === selectedCell.month,
      )
      .map((allocation) => ({
        allocation,
        resourceName: resourceLookup.get(allocation.resourceId)
          ? getResourceFullName(resourceLookup.get(allocation.resourceId)!)
          : 'Unknown resource',
      }))
      .sort((left, right) =>
        left.resourceName.localeCompare(right.resourceName, undefined, { sensitivity: 'base' }),
      );
  }, [data.allocations, data.resources, filters.year, selectedCell]);
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
            label: getResourceTypeDisplayLabel(resourceType),
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
        type: 'multi-select-popover',
        key: 'projectCodesFilter',
        label: 'Projects',
        values: filters.projectCodesFilter,
        options: projectFilterOptions,
        searchPlaceholder: 'Search projects',
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
    <div className="flex w-full flex-col gap-6 p-6" id="demand-coverage-board-page">
      <PageHeader
        description="Project × resource-type coverage, with demand, covered load, remaining demand, and over-service shown side-by-side so nothing is silently netted out."
        descriptionClassName="max-w-4xl"
        icon={Target}
        title="Demand Coverage Board"
      />

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

      <Card>
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
          <p>Loading demand coverage…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No demand row matches the current filters.
          </p>
        ) : (
          <TableShell caption="Demand coverage by project and resource type" zebra>
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
                  <td className="px-3 py-2" title={row.resourceTypeFullLabel}>
                    {row.resourceTypeLabel}
                  </td>
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
                      <button
                        aria-label={`${row.projectCode} — ${row.projectName}, ${row.resourceTypeLabel}, ${cell.label}. ${buildCoverageTooltip(cell)} View assigned resources.`}
                        className="min-w-[11rem] rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-2 text-left text-xs hover:border-[var(--color-bmx-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bmx-blue)]"
                        onClick={() =>
                          setSelectedCell({
                            projectCode: row.projectCode,
                            projectName: row.projectName,
                            resourceTypeId: row.resourceTypeId,
                            resourceTypeLabel: row.resourceTypeLabel,
                            month: cell.month,
                          })
                        }
                        type="button"
                      >
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
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Drawer
        onClose={() => setSelectedCell(null)}
        open={Boolean(selectedCell)}
        title={
          selectedCell
            ? `${selectedCell.projectCode} — ${selectedCell.projectName} · ${new Intl.DateTimeFormat(
                'en-US',
                { month: 'long' },
              ).format(new Date(filters.year, selectedCell.month - 1, 1))} ${filters.year}`
            : ''
        }
      >
        {selectedCell && selectedCellSummary ? (
          <div className="space-y-3 text-sm">
            <p className="text-[var(--text-secondary)]">{selectedCell.resourceTypeLabel}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              <li>Demand {formatDayAmount(selectedCellSummary.demandDays)} d</li>
              <li>Covered {formatDayAmount(selectedCellSummary.allocatedDays)} d</li>
              <li>Gap {formatDayAmount(selectedCellSummary.remainingDemandDays)} d</li>
              <li>Over-service {formatDayAmount(selectedCellSummary.overServiceDays)} d</li>
            </ul>
            <TableShell caption="Resources assigned for this project and month" zebra>
              <thead>
                <tr className="border-b border-[var(--surf-divider)]">
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Resource
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Type
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Days
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedAssignments.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-[var(--text-secondary)]" colSpan={3}>
                      No resources assigned yet.
                    </td>
                  </tr>
                ) : (
                  <>
                    {selectedAssignments.map(({ allocation, resourceName }) => (
                      <tr key={allocation.id} className="border-b border-[var(--surf-divider)]">
                        <td className="px-3 py-2">{resourceName}</td>
                        <td className="px-3 py-2">{selectedCell.resourceTypeLabel}</td>
                        <td className="px-3 py-2">{formatDayAmount(allocation.allocatedDays)} d</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="px-3 py-2" colSpan={2}>
                        Total
                      </td>
                      <td className="px-3 py-2">
                        {formatDayAmount(
                          selectedAssignments.reduce(
                            (total, entry) => total + entry.allocation.allocatedDays,
                            0,
                          ),
                        )}{' '}
                        d
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </TableShell>
            <Link
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-bmx-blue)] hover:underline"
              to="/allocation-studio"
            >
              Open in Allocation Studio
            </Link>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
