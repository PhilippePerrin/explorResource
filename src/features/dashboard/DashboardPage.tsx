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
import {
  AlertTriangle,
  Ban,
  Circle,
  Gauge,
  Info,
  TrendingDown,
  TrendingUp,
} from '@/components/icons';
import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import { UtilizationBadge } from '@/components/UtilizationBadge';
import { Card, IconChip, Skeleton, type IconChipTone } from '@/components/ui';
import { UtilizationRing } from '@/features/dashboard/UtilizationRing';
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
import { usePrefersReducedMotion } from '@/theme/usePrefersReducedMotion';

import {
  CHART_AXIS_COLOR,
  CHART_GRID_COLOR,
  CHART_LEGEND_STYLE,
  CHART_LINE_COLORS,
  CHART_TOOLTIP_STYLE,
} from './chartTheme';
import { buildDashboardViewModel, MONTH_LABELS, type DashboardAlert } from './dashboardModel';

const ALERT_ICONS: Record<DashboardAlert['tone'], typeof AlertTriangle> = {
  danger: Ban,
  warning: AlertTriangle,
  info: Info,
};

const ALERT_TONE_CLASSES: Record<DashboardAlert['tone'], string> = {
  danger:
    'border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--text-primary)]',
  warning:
    'border-[var(--status-attention-border)] bg-[var(--status-attention-bg)] text-[var(--text-primary)]',
  info: 'border-[var(--surf-divider)] bg-[var(--surf-700)] text-[var(--text-primary)]',
};

const ALERT_ICON_CHIP_TONES: Record<DashboardAlert['tone'], IconChipTone> = {
  danger: 'critical',
  warning: 'attention',
  info: 'info',
};

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
  const prefersReducedMotion = usePrefersReducedMotion();

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
      <PageHeader
        actions={
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
        }
        description="Portfolio overview for capacity, demand coverage, utilization, and the highest-priority alerts for the selected planning month."
        descriptionClassName="max-w-4xl"
        icon={Gauge}
        title="Dashboard"
      />

      <FeedbackMessage message={feedback} />

      {loading ? (
        <Card>
          <Skeleton label="Loading dashboard…" lines={5} />
        </Card>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <Card className="hero-rise hero-rise-delay-1 relative flex flex-wrap items-center gap-5 overflow-hidden">
              <div
                aria-hidden="true"
                className="bg-hexfield pointer-events-none absolute inset-0"
                style={{
                  maskImage: 'linear-gradient(135deg, black, transparent 75%)',
                  WebkitMaskImage: 'linear-gradient(135deg, black, transparent 75%)',
                }}
              />
              <UtilizationRing className="relative" utilization={viewModel.yearUtilization} />
              <div className="relative min-w-0 flex-1">
                <p className="font-accent text-4xl leading-none font-semibold tabular-nums">
                  {formatDayAmount(viewModel.yearTotals.netCapacityDays, displayPrecision)}
                  <span className="ml-1 font-sans text-base font-normal text-[var(--text-secondary)]">
                    d
                  </span>
                </p>
                <p className="mt-2 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                  Net capacity &middot; FY {year}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Allocated{' '}
                  {formatDayAmount(viewModel.yearTotals.assignedLoadDays, displayPrecision)} d for{' '}
                  {year}.
                </p>
                <UtilizationBadge
                  compact
                  displayPrecision={displayPrecision}
                  tooltip={`Year utilization based on ${formatDayAmount(viewModel.yearTotals.assignedLoadDays, displayPrecision)} allocated days over ${formatDayAmount(viewModel.yearTotals.netCapacityDays, displayPrecision)} net capacity days.`}
                  utilization={viewModel.yearUtilization}
                  className="mt-3"
                />
              </div>
            </Card>
            <MetricCard
              className="hero-rise hero-rise-delay-2"
              hint="Negative values mean planned overload."
              icon={TrendingUp}
              title="Available capacity"
              tone="success"
              value={`${formatDayAmount(viewModel.yearTotals.availableCapacityDays, displayPrecision)} d`}
            />
            <MetricCard
              className="hero-rise hero-rise-delay-3"
              hint={`${viewModel.underServedProjectsCount} project(s) still need staffing.`}
              icon={AlertTriangle}
              title="Uncovered demand"
              tone="attention"
              value={`${formatDayAmount(viewModel.yearTotals.remainingDemandDays, displayPrecision)} d`}
            />
            <MetricCard
              className="hero-rise hero-rise-delay-4"
              hint="Shown separately from coverage gaps to avoid silent netting."
              icon={TrendingDown}
              title="Over-service"
              tone="info"
              value={`${formatDayAmount(viewModel.yearTotals.overServiceDays, displayPrecision)} d`}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card className="bg-hexfield hero-rise hero-rise-delay-5">
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
                    <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      stroke={CHART_AXIS_COLOR}
                      tick={{ fill: CHART_AXIS_COLOR, fontSize: 12 }}
                    />
                    <YAxis
                      stroke={CHART_AXIS_COLOR}
                      tick={{ fill: CHART_AXIS_COLOR, fontSize: 12 }}
                    />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                    <Line
                      dataKey="netCapacityDays"
                      isAnimationActive={!prefersReducedMotion}
                      name="Net capacity (d)"
                      stroke={CHART_LINE_COLORS.netCapacity}
                      strokeWidth={2}
                      style={{ filter: 'drop-shadow(0 0 3px var(--color-bmx-cyan))' }}
                      type="monotone"
                    />
                    <Line
                      dataKey="assignedLoadDays"
                      isAnimationActive={!prefersReducedMotion}
                      name="Allocated load (d)"
                      stroke={CHART_LINE_COLORS.allocatedLoad}
                      strokeWidth={2}
                      type="monotone"
                    />
                    <Line
                      dataKey="remainingDemandDays"
                      isAnimationActive={!prefersReducedMotion}
                      name="Uncovered demand (d)"
                      stroke={CHART_LINE_COLORS.uncoveredDemand}
                      strokeWidth={2}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="hero-rise hero-rise-delay-5">
              <h2 className="text-xl font-semibold">Priority alerts</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Text, icon, and quantitative alerts for {viewModel.selectedMonthMetrics.label}{' '}
                {year}.
              </p>
              <ul className="mt-4 space-y-3">
                {viewModel.alerts.length === 0 ? (
                  <li className="flex items-center gap-3 rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4 text-sm">
                    <IconChip icon={Circle} size="sm" tone="success" />
                    No overload or uncovered-demand alert for the selected month.
                  </li>
                ) : (
                  viewModel.alerts.map((alert) => {
                    const AlertIcon = ALERT_ICONS[alert.tone];

                    return (
                      <li
                        className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${ALERT_TONE_CLASSES[alert.tone]}`}
                        key={alert.id}
                      >
                        <IconChip
                          icon={AlertIcon}
                          size="sm"
                          tone={ALERT_ICON_CHIP_TONES[alert.tone]}
                        />
                        <div>
                          <p className="font-semibold">{alert.title}</p>
                          <p className="mt-1 text-[var(--text-secondary)]">{alert.description}</p>
                        </div>
                      </li>
                    );
                  })
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
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
