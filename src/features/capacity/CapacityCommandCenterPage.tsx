import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  createColumnHelper,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import { FilterBar, type FilterBarField } from '@/components/FilterBar';
import { formatDayAmount } from '@/components/formatDayAmount';
import { Activity } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { UtilizationBadge } from '@/components/UtilizationBadge';
import { Card, TableShell } from '@/components/ui';
import type {
  Allocation,
  AppSettings,
  Company,
  Resource,
  ResourceNonWorkingDays,
  ResourceType,
  WorkingDaysCalendar,
} from '@/domain/entities';
import { usePersistentPageFilters, type FilterDefinitions } from '@/features/filters/filterState';
import { createRepository } from '@/persistence/repository';

import {
  buildCapacityDrilldownTooltip,
  buildCapacityRows,
  getFocusMonths,
  type CapacityFocus,
  type CapacityRow,
} from './capacityModel';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const companiesRepository = createRepository('companies');
const allocationsRepository = createRepository('allocations');
const workingDaysRepository = createRepository('workingDaysCalendars');
const resourceNonWorkingDaysRepository = createRepository('resourceNonWorkingDays');
const appSettingsRepository = createRepository('appSettings');

interface CapacityData {
  resources: Resource[];
  resourceTypes: ResourceType[];
  companies: Company[];
  allocations: Allocation[];
  workingDaysCalendars: WorkingDaysCalendar[];
  resourceNonWorkingDays: ResourceNonWorkingDays[];
  appSettings: AppSettings | null;
}

interface CapacityFilters {
  year: number;
  focus: CapacityFocus;
  searchTerm: string;
  resourceTypeFilter: string;
  companyFilter: string;
  statusFilter: 'all' | Resource['status'];
}

export function CapacityCommandCenterPage() {
  const initialDate = useRef(new Date()).current;
  const [data, setData] = useState<CapacityData>({
    resources: [],
    resourceTypes: [],
    companies: [],
    allocations: [],
    workingDaysCalendars: [],
    resourceNonWorkingDays: [],
    appSettings: null,
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [selectedDrilldown, setSelectedDrilldown] = useState<{
    row: CapacityRow;
    month: number;
  } | null>(null);
  const loadRequestIdRef = useRef(0);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const heatmapRegionRef = useRef<HTMLDivElement | null>(null);
  const filterDefinitions = useMemo<FilterDefinitions<CapacityFilters>>(
    () => ({
      year: { defaultValue: initialDate.getFullYear(), param: 'year' },
      focus: { defaultValue: 'year', param: 'focus' },
      searchTerm: { defaultValue: '', param: 'q', storage: 'local' },
      resourceTypeFilter: { defaultValue: 'all', param: 'type' },
      companyFilter: { defaultValue: 'all', param: 'company' },
      statusFilter: { defaultValue: 'all', param: 'status' },
    }),
    [initialDate],
  );
  const {
    filters,
    favorites,
    updateFilter,
    resetFilters,
    saveFavorite,
    applyFavorite,
    removeFavorite,
  } = usePersistentPageFilters('capacity-command-center', filterDefinitions);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const requestId = ++loadRequestIdRef.current;

    try {
      const [
        resources,
        resourceTypes,
        companies,
        allocations,
        workingDaysCalendars,
        resourceNonWorkingDays,
        appSettings,
      ] = await Promise.all([
        resourcesRepository.getAll(),
        resourceTypesRepository.getAll(),
        companiesRepository.getAll(),
        allocationsRepository.getAll(),
        workingDaysRepository.getAll(),
        resourceNonWorkingDaysRepository.getAll(),
        appSettingsRepository.getById('app-settings'),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({
        resources,
        resourceTypes,
        companies,
        allocations,
        workingDaysCalendars,
        resourceNonWorkingDays,
        appSettings: appSettings ?? null,
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to load capacity data.');
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  const yearOptions = useMemo(() => {
    const years = new Set<number>([filters.year]);
    for (const entry of data.allocations) years.add(entry.year);
    for (const entry of data.workingDaysCalendars) years.add(entry.year);
    return [...years].sort((left, right) => left - right);
  }, [data.allocations, data.workingDaysCalendars, filters.year]);
  const displayPrecision = data.appSettings?.displayPrecision ?? 1;
  const visibleMonths = useMemo(() => getFocusMonths(filters.focus), [filters.focus]);
  const focusGridCell = useCallback((rowIndex: number, monthIndex: number) => {
    const target = heatmapRegionRef.current?.querySelector<HTMLButtonElement>(
      `[data-grid-cell="true"][data-row-index="${rowIndex}"][data-month-index="${monthIndex}"]`,
    );
    target?.focus();
  }, []);
  const handleGridKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex);
      const monthIndex = Number(event.currentTarget.dataset.monthIndex);

      if (!Number.isInteger(rowIndex) || !Number.isInteger(monthIndex)) {
        return;
      }

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          focusGridCell(rowIndex, Math.min(monthIndex + 1, visibleMonths.length - 1));
          break;
        case 'ArrowLeft':
          event.preventDefault();
          focusGridCell(rowIndex, Math.max(monthIndex - 1, 0));
          break;
        case 'ArrowDown':
          event.preventDefault();
          focusGridCell(rowIndex + 1, monthIndex);
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusGridCell(Math.max(rowIndex - 1, 0), monthIndex);
          break;
        case 'Home':
          event.preventDefault();
          focusGridCell(rowIndex, 0);
          break;
        case 'End':
          event.preventDefault();
          focusGridCell(rowIndex, visibleMonths.length - 1);
          break;
        default:
          break;
      }
    },
    [focusGridCell, visibleMonths.length],
  );
  const rows = useMemo(
    () =>
      buildCapacityRows({
        resources: data.resources,
        resourceTypes: data.resourceTypes,
        allocations: data.allocations,
        workingDaysCalendars: data.workingDaysCalendars,
        resourceNonWorkingDays: data.resourceNonWorkingDays,
        appSettings: data.appSettings,
        year: filters.year,
        searchTerm: filters.searchTerm,
        resourceTypeFilter: filters.resourceTypeFilter,
        companyFilter: filters.companyFilter,
        statusFilter: filters.statusFilter,
      }),
    [
      data.allocations,
      data.appSettings,
      data.resourceNonWorkingDays,
      data.resourceTypes,
      data.resources,
      data.workingDaysCalendars,
      filters.companyFilter,
      filters.resourceTypeFilter,
      filters.searchTerm,
      filters.statusFilter,
      filters.year,
    ],
  );
  const filterFields = useMemo<FilterBarField[]>(
    () => [
      {
        type: 'search',
        key: 'searchTerm',
        label: 'Search',
        value: filters.searchTerm,
        placeholder: 'Search by resource or type',
        onChange: (value) => updateFilter('searchTerm', value),
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
        key: 'companyFilter',
        label: 'Company',
        value: filters.companyFilter,
        options: [
          { value: 'all', label: 'All companies' },
          ...data.companies
            .slice()
            .sort((left, right) =>
              left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
            )
            .map((company) => ({
              value: company.id,
              label: company.name,
            })),
        ],
        onChange: (value) => updateFilter('companyFilter', value),
      },
      {
        type: 'single-select',
        key: 'statusFilter',
        label: 'Status',
        value: filters.statusFilter,
        options: [
          { value: 'all', label: 'All statuses' },
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ],
        onChange: (value) => updateFilter('statusFilter', value as CapacityFilters['statusFilter']),
      },
      {
        type: 'single-select',
        key: 'focus',
        label: 'Focus',
        value: filters.focus,
        options: [
          { value: 'year', label: 'Year' },
          { value: 's1', label: 'S1' },
          { value: 's2', label: 'S2' },
          { value: 'q1', label: 'Q1' },
          { value: 'q2', label: 'Q2' },
          { value: 'q3', label: 'Q3' },
          { value: 'q4', label: 'Q4' },
        ],
        onChange: (value) => updateFilter('focus', value as CapacityFocus),
      },
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
    ],
    [
      data.companies,
      data.resourceTypes,
      filters.companyFilter,
      filters.focus,
      filters.resourceTypeFilter,
      filters.searchTerm,
      filters.statusFilter,
      filters.year,
      updateFilter,
      yearOptions,
    ],
  );
  const columnHelper = createColumnHelper<CapacityRow>();
  const columns = useMemo(
    () => [
      columnHelper.accessor('resourceTypeLabel', {
        header: 'Resource type',
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
      }),
      columnHelper.accessor('resourceName', {
        header: 'Resource',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      ...visibleMonths.map((month) =>
        columnHelper.display({
          id: `month-${month}`,
          header: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
            new Date(filters.year, month - 1, 1),
          ),
          cell: ({ row }) => {
            const summary = row.original.summaries[month - 1];

            if (!summary) {
              return null;
            }

            return (
              <button
                aria-label={`${row.original.resourceName}, ${new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(filters.year, month - 1, 1))} ${filters.year}. ${buildCapacityDrilldownTooltip(summary, displayPrecision)}`}
                className="rounded-lg border border-transparent p-1 text-left hover:border-[var(--surf-divider)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bmx-blue)]"
                data-grid-cell="true"
                data-month-index={visibleMonths.indexOf(month)}
                data-row-index={row.index}
                onKeyDown={handleGridKeyDown}
                onClick={() => setSelectedDrilldown({ row: row.original, month })}
                type="button"
              >
                <UtilizationBadge
                  compact
                  displayPrecision={displayPrecision}
                  tooltip={buildCapacityDrilldownTooltip(summary, displayPrecision)}
                  utilization={summary.utilization}
                />
              </button>
            );
          },
        }),
      ),
    ],
    [columnHelper, displayPrecision, filters.year, handleGridKeyDown, visibleMonths],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 58,
    overscan: 6,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const renderedRowIndexes =
    virtualRows.length > 0
      ? virtualRows.map((virtualRow) => ({
          index: virtualRow.index,
          start: virtualRow.start,
          key: virtualRow.key,
        }))
      : table.getRowModel().rows.map((row, index) => ({
          index,
          start: index * 58,
          key: row.id,
        }));
  const selectedSummary = selectedDrilldown?.row.summaries[selectedDrilldown.month - 1] ?? null;
  const selectedAllocations = selectedDrilldown
    ? data.allocations.filter(
        (allocation) =>
          allocation.resourceId === selectedDrilldown.row.resource.id &&
          allocation.year === filters.year &&
          allocation.month === selectedDrilldown.month,
      )
    : [];

  return (
    <div className="flex w-full flex-col gap-6 p-6" id="capacity-command-center-page">
      <PageHeader
        description="Virtualized heatmap for utilization by resource and month. Every cell includes label, icon, value, and tooltip — never color only."
        descriptionClassName="max-w-4xl"
        icon={Activity}
        title="Capacity Command Center"
      />

      <FeedbackMessage message={feedback} />

      <FilterBar
        favorites={favorites}
        fields={filterFields}
        onApplyFavorite={applyFavorite}
        onDeleteFavorite={removeFavorite}
        onReset={resetFilters}
        onSaveFavorite={saveFavorite}
        resultsSummary={`${rows.length} resource row(s)`}
      />

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold" id="capacity-heatmap-heading">
              Utilization heatmap
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Rows are virtualized for responsive rendering.
            </p>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{rows.length} resource row(s)</p>
        </div>

        {loading ? (
          <p>Loading capacity heatmap…</p>
        ) : (
          <div
            aria-describedby="capacity-grid-instructions"
            aria-labelledby="capacity-heatmap-heading"
            ref={heatmapRegionRef}
            role="region"
          >
            <p className="sr-only" id="capacity-grid-instructions">
              Use Tab to enter the heatmap buttons, then use arrow keys to move between months and
              resources. Press Enter or Space to open the drill-down for the focused month.
            </p>
            <div className="overflow-x-auto">
              <table
                aria-colcount={visibleMonths.length + 2}
                aria-rowcount={rows.length + 1}
                className="min-w-full border-collapse text-left text-sm"
              >
                <caption className="sr-only">
                  Capacity utilization heatmap by resource and month.
                </caption>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-[var(--surf-divider)]">
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} className="px-3 py-2 font-semibold" scope="col">
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
              </table>
            </div>
            <div
              ref={tableContainerRef}
              className="max-h-[28rem] overflow-auto"
              data-testid="capacity-virtualized-body"
            >
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                {/*
                  Not wrapped in TableShell: the header/body split into two
                  separate <table> elements is what lets the body scroll
                  independently while the header stays fixed, and the
                  virtualizer measures this exact scrolling container
                  (tableContainerRef) — TableShell's single table/caption
                  wrapper doesn't fit that shape without risking the
                  measurement. Zebra striping is applied per-row below,
                  keyed off the absolute row index rather than DOM position
                  (nth-child), since virtualization only renders a sliding
                  window of rows and nth-child would shift during scroll.
                */}
                <table className="min-w-full border-collapse text-left text-sm">
                  <tbody>
                    {renderedRowIndexes.map((virtualRow) => {
                      const row = table.getRowModel().rows[virtualRow.index];

                      if (!row) {
                        return null;
                      }

                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-[var(--surf-divider)] ${virtualRow.index % 2 === 1 ? 'bg-[var(--surf-700)]' : ''}`}
                          data-index={virtualRow.index}
                          style={{
                            position: 'absolute',
                            transform: `translateY(${virtualRow.start}px)`,
                            width: '100%',
                          }}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-3 py-2 align-top">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-xl font-semibold">Drill-down</h2>
        {selectedDrilldown && selectedSummary ? (
          <div className="mt-4 space-y-3 text-sm">
            <p className="font-medium">
              {selectedDrilldown.row.resourceName} —{' '}
              {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
                new Date(filters.year, selectedDrilldown.month - 1, 1),
              )}{' '}
              {filters.year}
            </p>
            <UtilizationBadge
              displayPrecision={displayPrecision}
              tooltip={buildCapacityDrilldownTooltip(selectedSummary, displayPrecision)}
              utilization={selectedSummary.utilization}
            />
            <ul className="grid gap-2 md:grid-cols-4">
              <li>
                Net capacity: {formatDayAmount(selectedSummary.netCapacityDays, displayPrecision)} d
              </li>
              <li>
                Assigned load: {formatDayAmount(selectedSummary.assignedLoadDays, displayPrecision)}{' '}
                d
              </li>
              <li>
                Available capacity:{' '}
                {formatDayAmount(selectedSummary.availableCapacityDays, displayPrecision)} d
              </li>
              <li>Allocations: {selectedAllocations.length}</li>
            </ul>
            <TableShell caption="Allocations for the selected resource and month" zebra>
              <thead>
                <tr className="border-b border-[var(--surf-divider)]">
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Project
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Days
                  </th>
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Origin
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedAllocations.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-[var(--text-secondary)]" colSpan={3}>
                      No allocation on this month.
                    </td>
                  </tr>
                ) : (
                  selectedAllocations.map((allocation) => (
                    <tr key={allocation.id} className="border-b border-[var(--surf-divider)]">
                      <td className="px-3 py-2">{allocation.projectCode}</td>
                      <td className="px-3 py-2">
                        {formatDayAmount(allocation.allocatedDays, displayPrecision)} d
                      </td>
                      <td className="px-3 py-2">{allocation.origin}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Select a utilization cell to inspect the month details and underlying allocations.
          </p>
        )}
      </Card>
    </div>
  );
}
