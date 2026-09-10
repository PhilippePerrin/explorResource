import type { FieldErrors, UseFormReturn } from 'react-hook-form';

import { DemandCoverageBadge } from '@/components/DemandCoverageBadge';
import { formatDayAmount } from '@/components/formatDayAmount';
import { MetricCard } from '@/components/MetricCard';
import { UtilizationBadge } from '@/components/UtilizationBadge';
import { Button, Drawer } from '@/components/ui';
import type { Project, Resource, ResourceType } from '@/domain/entities';
import { getResourceFullName } from '@/domain/entities';

import type { AllocationChangeValues, AllocationSimulationPreview } from './allocationStudioModel';
import { buildCoverageBarCaption } from './allocationStudioModel';

function getErrorSummary(errors: FieldErrors<AllocationChangeValues>): string[] {
  return Object.values(errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));
}

export interface QuickAssignDrawerProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<AllocationChangeValues>;
  resources: readonly Resource[];
  projects: readonly Project[];
  resourceTypes: readonly ResourceType[];
  preview: AllocationSimulationPreview | null;
  displayPrecision: number;
  onSimulate: (values: AllocationChangeValues) => void;
  onQueue: (values: AllocationChangeValues) => void;
}

export function QuickAssignDrawer({
  open,
  onClose,
  form,
  resources,
  projects,
  resourceTypes,
  preview,
  displayPrecision,
  onSimulate,
  onQueue,
}: QuickAssignDrawerProps) {
  const formErrors = getErrorSummary(form.formState.errors);

  return (
    <Drawer
      description="Choose the resource, project, and days, review the simulated impact, then add it to your draft."
      open={open}
      title="Add allocation"
      widthClassName="sm:max-w-2xl"
      onClose={onClose}
    >
      {formErrors.length > 0 ? (
        <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-red-300">
          {formErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <form className="space-y-3" onSubmit={form.handleSubmit(onQueue)}>
        <label className="block text-sm font-medium" htmlFor="studio-mode">
          Change mode
          <select
            className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
            id="studio-mode"
            {...form.register('mode')}
          >
            <option value="add">Add to allocation</option>
            <option value="set">Set allocation exactly</option>
            <option value="move">Move from another project</option>
          </select>
        </label>
        <label className="block text-sm font-medium" htmlFor="studio-resource">
          Resource
          <select
            className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
            id="studio-resource"
            {...form.register('resourceId')}
          >
            <option value="">Select a resource</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {getResourceFullName(resource)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium" htmlFor="studio-source-project">
          Source project (for move)
          <select
            className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
            id="studio-source-project"
            {...form.register('sourceProjectCode')}
          >
            <option value="">None</option>
            {projects.map((project) => (
              <option key={project.id} value={project.code}>
                {project.code} — {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium" htmlFor="studio-project">
          Target project
          <select
            className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
            id="studio-project"
            {...form.register('projectCode')}
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.code}>
                {project.code} — {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium" htmlFor="studio-form-type">
          Resource type
          <select
            className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
            id="studio-form-type"
            {...form.register('resourceTypeId')}
          >
            <option value="">Select a resource type</option>
            {resourceTypes.map((resourceType) => (
              <option key={resourceType.id} value={resourceType.id}>
                {resourceType.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium" htmlFor="studio-form-year">
            Year
            <input
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="studio-form-year"
              type="number"
              {...form.register('year', { valueAsNumber: true })}
            />
          </label>
          <label className="block text-sm font-medium" htmlFor="studio-form-month">
            Month
            <select
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="studio-form-month"
              {...form.register('month', { valueAsNumber: true })}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium" htmlFor="studio-form-days">
            Days
            <input
              className="mt-1 w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-700)] px-3 py-2"
              id="studio-form-days"
              step="0.1"
              type="number"
              {...form.register('allocatedDays', { valueAsNumber: true })}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={form.handleSubmit(onSimulate)}>
            Simulate change
          </Button>
          <Button type="submit">Queue change</Button>
        </div>
      </form>

      <div className="mt-6">
        <h3 className="text-lg font-semibold">Simulation preview</h3>
        {preview ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <MetricCard
              accent={
                <UtilizationBadge
                  compact
                  displayPrecision={displayPrecision}
                  tooltip={`After simulation: ${formatDayAmount(
                    preview.afterResourceSummary.assignedLoadDays,
                    displayPrecision,
                  )} allocated days over ${formatDayAmount(
                    preview.afterResourceSummary.netCapacityDays,
                    displayPrecision,
                  )} net capacity days.`}
                  utilization={preview.afterResourceSummary.utilization}
                />
              }
              hint={`Before: ${formatDayAmount(
                preview.beforeResourceSummary.assignedLoadDays,
                displayPrecision,
              )} d · Available after: ${formatDayAmount(
                preview.afterResourceSummary.availableCapacityDays,
                displayPrecision,
              )} d`}
              title="Resource utilization after change"
              value={`${formatDayAmount(
                preview.afterResourceSummary.assignedLoadDays,
                displayPrecision,
              )} d assigned`}
            />
            <MetricCard
              accent={
                <DemandCoverageBadge
                  compact
                  displayPrecision={displayPrecision}
                  summary={preview.afterDemandSummary}
                  tooltip={buildCoverageBarCaption(preview.afterDemandSummary, displayPrecision)}
                />
              }
              hint={`Gap before/after: ${formatDayAmount(
                preview.beforeDemandSummary.remainingDemandDays,
                displayPrecision,
              )} d → ${formatDayAmount(
                preview.afterDemandSummary.remainingDemandDays,
                displayPrecision,
              )} d. Over-service after: ${formatDayAmount(
                preview.afterDemandSummary.overServiceDays,
                displayPrecision,
              )} d.`}
              title="Demand coverage after change"
              value={`${formatDayAmount(
                preview.afterDemandSummary.coverageRatePercent,
                displayPrecision,
              )}% covered`}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Run a simulation to review utilization and coverage before adding this to your draft.
          </p>
        )}
      </div>
    </Drawer>
  );
}
