import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import { MetricCard } from '@/components/MetricCard';
import { UtilizationBadge } from '@/components/UtilizationBadge';
import type {
  Allocation,
  AppSettings,
  DemandSnapshot,
  ImportBatch,
  Resource,
  ResourceNonWorkingDays,
  WorkingDaysCalendar,
} from '@/domain/entities';
import { createRepository } from '@/persistence/repository';

import { buildDashboardViewModel, MONTH_LABELS } from './dashboardModel';

const resourcesRepository = createRepository('resources');
const allocationsRepository = createRepository('allocations');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const workingDaysRepository = createRepository('workingDaysCalendars');
const resourceNonWorkingDaysRepository = createRepository('resourceNonWorkingDays');
const appSettingsRepository = createRepository('appSettings');
const importBatchesRepository = createRepository('importBatches');

interface DashboardData {
  resources: Resource[];
  allocations: Allocation[];
  demandSnapshots: DemandSnapshot[];
  workingDaysCalendars: WorkingDaysCalendar[];
  resourceNonWorkingDays: ResourceNonWorkingDays[];
  appSettings: AppSettings | null;
  importBatches: ImportBatch[];
}

function formatDayAmount(value: number, displayPrecision = 1): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: displayPrecision,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, displayPrecision),
  }).format(value);
}

export function DashboardPage() {
  const now = new Date();
  const [data, setData] = useState<DashboardData>({
    resources: [],
    allocations: [],
    demandSnapshots: [],
    workingDaysCalendars: [],
    resourceNonWorkingDays: [],
    appSettings: null,
    importBatches: [],
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const requestId = ++loadRequestIdRef.current;

    try {
      const [
        resources,
        allocations,
        demandSnapshots,
        workingDaysCalendars,
        resourceNonWorkingDays,
        appSettings,
        importBatches,
      ] = await Promise.all([
        resourcesRepository.getAll(),
        allocationsRepository.getAll(),
        demandSnapshotsRepository.getAll(),
        workingDaysRepository.getAll(),
        resourceNonWorkingDaysRepository.getAll(),
        appSettingsRepository.getById('app-settings'),
        importBatchesRepository.getAll(),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setData({
        resources,
        allocations,
        demandSnapshots,
        workingDaysCalendars,
        resourceNonWorkingDays,
        appSettings: appSettings ?? null,
        importBatches,
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to load dashboard data.');
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  const yearOptions = useMemo(() => {
    const years = new Set<number>([year]);

    for (const item of data.allocations) {
      years.add(item.year);
    }

    for (const item of data.demandSnapshots) {
      years.add(item.year);
    }

    for (const item of data.workingDaysCalendars) {
      years.add(item.year);
    }

    return [...years].sort((left, right) => left - right);
  }, [data.allocations, data.demandSnapshots, data.workingDaysCalendars, year]);

  const displayPrecision = data.appSettings?.displayPrecision ?? 1;
  const viewModel = useMemo(
    () =>
      buildDashboardViewModel({
        resources: data.resources,
        allocations: data.allocations,
        demandSnapshots: data.demandSnapshots,
        workingDaysCalendars: data.workingDaysCalendars,
        resourceNonWorkingDays: data.resourceNonWorkingDays,
        appSettings: data.appSettings,
        importBatches: data.importBatches,
        year,
        selectedMonth,
      }),
    [
      data.allocations,
      data.appSettings,
      data.demandSnapshots,
      data.importBatches,
      data.resourceNonWorkingDays,
      data.resources,
      data.workingDaysCalendars,
      selectedMonth,
      year,
    ],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6" id="dashboard-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="max-w-4xl text-sm text-[var(--text-secondary)]">
            Portfolio overview for capacity, demand coverage, utilization, and the highest-priority
            alerts for the selected planning month.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="dashboard-year">
            Year
            <select
              className="mt-1 block w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-800)] px-3 py-2"
              id="dashboard-year"
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
          <label className="text-sm font-medium" htmlFor="dashboard-month">
            Alert focus month
            <select
              className="mt-1 block w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-800)] px-3 py-2"
              id="dashboard-month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
            >
              {MONTH_LABELS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <FeedbackMessage message={feedback} />

      {loading ? (
        <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-6">
          <p>Loading dashboard…</p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Net capacity"
              value={`${formatDayAmount(viewModel.yearTotals.netCapacityDays, displayPrecision)} d`}
              hint={`Allocated ${formatDayAmount(viewModel.yearTotals.assignedLoadDays, displayPrecision)} d for ${year}.`}
              accent={
                <UtilizationBadge
                  compact
                  displayPrecision={displayPrecision}
                  tooltip={`Year utilization based on ${formatDayAmount(viewModel.yearTotals.assignedLoadDays, displayPrecision)} allocated days over ${formatDayAmount(viewModel.yearTotals.netCapacityDays, displayPrecision)} net capacity days.`}
                  utilization={viewModel.yearUtilization}
                />
              }
            />
            <MetricCard
              title="Available capacity"
              value={`${formatDayAmount(viewModel.yearTotals.availableCapacityDays, displayPrecision)} d`}
              hint="Negative values mean planned overload."
            />
            <MetricCard
              title="Uncovered demand"
              value={`${formatDayAmount(viewModel.yearTotals.remainingDemandDays, displayPrecision)} d`}
              hint={`${viewModel.underServedProjectsCount} project(s) still need staffing.`}
            />
            <MetricCard
              title="Over-service"
              value={`${formatDayAmount(viewModel.yearTotals.overServiceDays, displayPrecision)} d`}
              hint="Shown separately from coverage gaps to avoid silent netting."
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Utilization trend</h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Monthly net capacity, allocated load, and residual demand for {year}.
                  </p>
                </div>
                <UtilizationBadge
                  compact
                  displayPrecision={displayPrecision}
                  tooltip={`${viewModel.selectedMonthMetrics.label}: ${formatDayAmount(viewModel.selectedMonthMetrics.assignedLoadDays, displayPrecision)} allocated days over ${formatDayAmount(viewModel.selectedMonthMetrics.netCapacityDays, displayPrecision)} net capacity days.`}
                  utilization={viewModel.selectedMonthMetrics.utilization}
                />
              </div>
              <div
                className="h-80 w-full"
                data-testid="dashboard-utilization-chart"
                style={{ minHeight: 320, minWidth: 320 }}
              >
                <ResponsiveContainer height="100%" width="100%">
                  <LineChart data={viewModel.months}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      dataKey="netCapacityDays"
                      name="Net capacity (d)"
                      stroke="#2563eb"
                      strokeWidth={2}
                      type="monotone"
                    />
                    <Line
                      dataKey="assignedLoadDays"
                      name="Allocated load (d)"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      type="monotone"
                    />
                    <Line
                      dataKey="remainingDemandDays"
                      name="Uncovered demand (d)"
                      stroke="#ef4444"
                      strokeWidth={2}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
              <h2 className="text-xl font-semibold">Priority alerts</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Text, icon, and quantitative alerts for {viewModel.selectedMonthMetrics.label}{' '}
                {year}.
              </p>
              <ul className="mt-4 space-y-3">
                {viewModel.alerts.length === 0 ? (
                  <li className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm">
                    ○ No overload or uncovered-demand alert for the selected month.
                  </li>
                ) : (
                  viewModel.alerts.map((alert) => (
                    <li
                      key={alert.id}
                      className={`rounded-lg border p-4 text-sm ${alert.tone === 'danger' ? 'border-red-500/40 bg-red-950/20' : alert.tone === 'warning' ? 'border-orange-500/40 bg-orange-950/20' : 'border-[var(--surf-divider)] bg-[var(--surf-700)]'}`}
                    >
                      <p className="font-semibold">
                        <span aria-hidden="true">{alert.icon}</span> {alert.title}
                      </p>
                      <p className="mt-1 text-[var(--text-secondary)]">{alert.description}</p>
                    </li>
                  ))
                )}
              </ul>

              <div className="mt-6 rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4 text-sm">
                <h3 className="font-semibold">Demand variation since the last validated import</h3>
                {viewModel.demandVariation ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-[var(--text-secondary)]">
                      Comparing {viewModel.demandVariation.latestBatchLabel} vs.{' '}
                      {viewModel.demandVariation.previousBatchLabel}.
                    </p>
                    <ul className="space-y-1">
                      <li>
                        + Positive delta:{' '}
                        {formatDayAmount(
                          viewModel.demandVariation.positiveDeltaDays,
                          displayPrecision,
                        )}{' '}
                        d
                      </li>
                      <li>
                        - Negative delta:{' '}
                        {formatDayAmount(
                          viewModel.demandVariation.negativeDeltaDays,
                          displayPrecision,
                        )}{' '}
                        d
                      </li>
                      <li>
                        = Net delta:{' '}
                        {formatDayAmount(viewModel.demandVariation.netDeltaDays, displayPrecision)}{' '}
                        d
                      </li>
                    </ul>
                  </div>
                ) : (
                  <p className="mt-3 text-[var(--text-secondary)]">
                    At least two validated imports are required before demand variation can be
                    computed.
                  </p>
                )}
              </div>
            </section>
          </section>
        </>
      )}
    </div>
  );
}
