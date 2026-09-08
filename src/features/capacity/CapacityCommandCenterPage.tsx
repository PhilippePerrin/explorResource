import { useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  createColumnHelper,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import { UtilizationBadge } from '@/components/UtilizationBadge';
import type {
  Allocation,
  AppSettings,
  Resource,
  ResourceNonWorkingDays,
  ResourceType,
  WorkingDaysCalendar,
} from '@/domain/entities';
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
const allocationsRepository = createRepository('allocations');
const workingDaysRepository = createRepository('workingDaysCalendars');
const resourceNonWorkingDaysRepository = createRepository('resourceNonWorkingDays');
const appSettingsRepository = createRepository('appSettings');

interface CapacityData {
  resources: Resource[];
  resourceTypes: ResourceType[];
  allocations: Allocation[];
  workingDaysCalendars: WorkingDaysCalendar[];
  resourceNonWorkingDays: ResourceNonWorkingDays[];
  appSettings: AppSettings | null;
}

function formatDayAmount(value: number, displayPrecision = 1): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: displayPrecision,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, displayPrecision),
  }).format(value);
}

export function CapacityCommandCenterPage() {
  const now = new Date();
  const [data, setData] = useState<CapacityData>({
    resources: [],
    resourceTypes: [],
    allocations: [],
    workingDaysCalendars: [],
    resourceNonWorkingDays: [],
    appSettings: null,
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [focus, setFocus] = useState<CapacityFocus>('year');
  const [searchTerm, setSearchTerm] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Resource['status']>('all');
  const [selectedDrilldown, setSelectedDrilldown] = useState<{
    row: CapacityRow;
    month: number;
  } | null>(null);
  const loadRequestIdRef = useRef(0);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

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
        allocations,
        workingDaysCalendars,
        resourceNonWorkingDays,
        appSettings,
      ] = await Promise.all([
        resourcesRepository.getAll(),
        resourceTypesRepository.getAll(),
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
    const years = new Set<number>([year]);
    for (const entry of data.allocations) years.add(entry.year);
    for (const entry of data.workingDaysCalendars) years.add(entry.year);
    return [...years].sort((left, right) => left - right);
  }, [data.allocations, data.workingDaysCalendars, year]);
  const displayPrecision = data.appSettings?.displayPrecision ?? 1;
  const rows = useMemo(
    () =>
      buildCapacityRows({
        resources: data.resources,
        resourceTypes: data.resourceTypes,
        allocations: data.allocations,
        workingDaysCalendars: data.workingDaysCalendars,
        resourceNonWorkingDays: data.resourceNonWorkingDays,
        appSettings: data.appSettings,
        year,
        searchTerm,
        resourceTypeFilter,
        statusFilter,
      }),
    [
      data.allocations,
      data.appSettings,
      data.resourceNonWorkingDays,
      data.resourceTypes,
      data.resources,
      data.workingDaysCalendars,
      resourceTypeFilter,
      searchTerm,
      statusFilter,
      year,
    ],
  );
  const visibleMonths = useMemo(() => getFocusMonths(focus), [focus]);
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
            new Date(year, month - 1, 1),
          ),
          cell: ({ row }) => {
            const summary = row.original.summaries[month - 1];

            if (!summary) {
              return null;
            }

            return (
              <button
                className="rounded-lg border border-transparent p-1 text-left hover:border-[var(--surf-divider)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bmx-blue)]"
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
    [columnHelper, displayPrecision, visibleMonths, year],
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
          allocation.year === year &&
          allocation.month === selectedDrilldown.month,
      )
    : [];

  return (
    <main
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6"
      id="capacity-command-center-page"
    >
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Capacity Command Center</h1>
        <p className="max-w-4xl text-sm text-[var(--text-secondary)]">
          Virtualized heatmap for utilization by resource and month. Every cell includes label,
          icon, value, and tooltip — never color only.
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
        <div className="grid gap-3 lg:grid-cols-5">
          <label className="text-sm font-medium" htmlFor="capacity-search">
            Search
            <input
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="capacity-search"
              placeholder="Search by resource or type"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="capacity-resource-type">
            Resource type
            <select
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="capacity-resource-type"
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
          <label className="text-sm font-medium" htmlFor="capacity-status">
            Status
            <select
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="capacity-status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | Resource['status'])
              }
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="capacity-focus">
            Focus
            <select
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="capacity-focus"
              value={focus}
              onChange={(event) => setFocus(event.target.value as CapacityFocus)}
            >
              <option value="year">Year</option>
              <option value="s1">S1</option>
              <option value="s2">S2</option>
              <option value="q1">Q1</option>
              <option value="q2">Q2</option>
              <option value="q3">Q3</option>
              <option value="q4">Q4</option>
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="capacity-year">
            Year
            <select
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="capacity-year"
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
        </div>
      </section>

      <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Utilization heatmap</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Rows are virtualized for responsive rendering.
            </p>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{rows.length} resource row(s)</p>
        </div>

        {loading ? (
          <p>Loading capacity heatmap…</p>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
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
                          className="border-b border-[var(--surf-divider)]"
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
      </section>

      <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
        <h2 className="text-xl font-semibold">Drill-down</h2>
        {selectedDrilldown && selectedSummary ? (
          <div className="mt-4 space-y-3 text-sm">
            <p className="font-medium">
              {selectedDrilldown.row.resourceName} �{' '}
              {new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
                new Date(year, selectedDrilldown.month - 1, 1),
              )}{' '}
              {year}
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
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--surf-divider)]">
                    <th className="px-3 py-2 font-semibold">Project</th>
                    <th className="px-3 py-2 font-semibold">Days</th>
                    <th className="px-3 py-2 font-semibold">Origin</th>
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
              </table>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Select a utilization cell to inspect the month details and underlying allocations.
          </p>
        )}
      </section>
    </main>
  );
}
