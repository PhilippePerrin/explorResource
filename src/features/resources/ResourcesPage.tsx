import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type FieldErrors, type FieldValues, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DemandCoverageBadge } from '@/components/DemandCoverageBadge';
import { FeedbackMessage } from '@/components/FeedbackMessage';
import { FilterBar, type FilterBarField } from '@/components/FilterBar';
import { Users } from '@/components/icons';
import { PageHeader } from '@/components/PageHeader';
import { UtilizationBadge } from '@/components/UtilizationBadge';
import { Button, Drawer, EmptyState, Skeleton, TableShell } from '@/components/ui';
import {
  getResourceFullName,
  type Allocation,
  type AppSettings,
  type Company,
  type DemandSnapshot,
  type Project,
  type Resource,
  type ResourceNonWorkingDays,
  type ResourceType,
  type WorkingDaysCalendar,
} from '@/domain/entities';
import { usePersistentPageFilters, type FilterDefinitions } from '@/features/filters/filterState';
import { getResourceTypeDisplayLabel } from '@/features/resource-types';
import { createRepository } from '@/persistence/repository';

import {
  buildAllocationDemandStatus,
  createAllocationDefaultValues,
  createAllocationFormSchema,
  sortAllocations,
  sortProjectsForAllocation,
  type AllocationDemandStatus,
  type AllocationFormValues,
} from './allocationUtils';
import {
  buildResourceMonthlySummary,
  countResourceReferences,
  createResourceDefaultValues,
  createResourceFormSchema,
  sortCompaniesForSelection,
  sortResources,
  sortResourceTypesForSelection,
  type ResourceFormValues,
} from './resourceUtils';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const companiesRepository = createRepository('companies');
const allocationsRepository = createRepository('allocations');
const projectsRepository = createRepository('projects');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const workingDaysCalendarsRepository = createRepository('workingDaysCalendars');
const resourceNonWorkingDaysRepository = createRepository('resourceNonWorkingDays');
const appSettingsRepository = createRepository('appSettings');

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

type StatusFilter = 'all' | Resource['status'];

interface ResourceFilters {
  searchTerm: string;
  statusFilter: StatusFilter;
  resourceTypeFilter: string;
  companyFilter: string;
  collaborationTypeFilter: 'all' | Resource['collaborationType'];
}

interface ResourcesPageData {
  resources: Resource[];
  resourceTypes: ResourceType[];
  companies: Company[];
  allocations: Allocation[];
  projects: Project[];
  demandSnapshots: DemandSnapshot[];
  workingDaysCalendars: WorkingDaysCalendar[];
  resourceNonWorkingDays: ResourceNonWorkingDays[];
  appSettings: AppSettings | null;
}

type PendingResourceAction =
  | { type: 'archive' | 'restore'; resource: Resource; referenceCount: number }
  | { type: 'delete'; resource: Resource; referenceCount: number };

type PendingAllocationAction = { type: 'delete'; allocation: Allocation };

function nowIso(): string {
  return new Date().toISOString();
}

function buildResolverResult<T extends FieldValues>(schema: z.ZodType<T>, values: unknown) {
  const result = schema.safeParse(values);

  if (result.success) {
    return {
      values: result.data,
      errors: {} as FieldErrors<T>,
    };
  }

  const errors = {} as FieldErrors<T>;
  const typedErrors = errors as Record<string, { type: string; message: string }>;

  for (const issue of result.error.issues) {
    const path = issue.path.join('.');

    if (!path || typedErrors[path]) {
      continue;
    }

    typedErrors[path] = {
      type: issue.code,
      message: issue.message,
    };
  }

  return {
    values: {} as T,
    errors,
  };
}

function getErrorSummary<T extends FieldValues>(errors: FieldErrors<T>): string[] {
  return Object.values(errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));
}

function formatDayAmount(value: number, displayPrecision = 1): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: displayPrecision,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, displayPrecision),
  }).format(value);
}

function getMonthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? `Month ${month}`;
}

function parseLocaleInput(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return Number.NaN;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return Number.NaN;
  }

  return Number(trimmed.replace(',', '.'));
}

function createAllocationPreview(
  values: AllocationFormValues,
  resourceId: string,
  allocationId?: string,
): Allocation | null {
  if (
    !values.projectCode ||
    !values.resourceTypeId ||
    !Number.isInteger(values.year) ||
    !Number.isInteger(values.month) ||
    values.month < 1 ||
    values.month > 12 ||
    !Number.isFinite(values.allocatedDays)
  ) {
    return null;
  }

  return {
    id: allocationId ?? 'draft-allocation',
    resourceId,
    projectCode: values.projectCode,
    resourceTypeId: values.resourceTypeId,
    year: values.year,
    month: values.month,
    allocatedDays: values.allocatedDays,
    origin: values.origin,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function ResourcesPage() {
  const initialDate = useRef(new Date()).current;
  const [data, setData] = useState<ResourcesPageData>({
    resources: [],
    resourceTypes: [],
    companies: [],
    allocations: [],
    projects: [],
    demandSnapshots: [],
    workingDaysCalendars: [],
    resourceNonWorkingDays: [],
    appSettings: null,
  });
  const [loading, setLoading] = useState(true);
  const [resourceSubmitting, setResourceSubmitting] = useState(false);
  const [allocationSubmitting, setAllocationSubmitting] = useState(false);
  const [busyResourceAction, setBusyResourceAction] = useState(false);
  const [busyAllocationAction, setBusyAllocationAction] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAllocationId, setEditingAllocationId] = useState<string | undefined>();
  const [summaryYear, setSummaryYear] = useState(initialDate.getFullYear());
  const [summaryMonth, setSummaryMonth] = useState(initialDate.getMonth() + 1);
  const [pendingResourceAction, setPendingResourceAction] = useState<PendingResourceAction | null>(
    null,
  );
  const [pendingAllocationAction, setPendingAllocationAction] =
    useState<PendingAllocationAction | null>(null);
  const [feedback, setFeedback] = useState('');
  const loadRequestIdRef = useRef(0);
  const filterDefinitions = useMemo<FilterDefinitions<ResourceFilters>>(
    () => ({
      searchTerm: { defaultValue: '', param: 'q', storage: 'local' },
      statusFilter: { defaultValue: 'all', param: 'status' },
      resourceTypeFilter: { defaultValue: 'all', param: 'type' },
      companyFilter: { defaultValue: 'all', param: 'company' },
      collaborationTypeFilter: { defaultValue: 'all', param: 'collab' },
    }),
    [],
  );
  const {
    filters,
    favorites,
    updateFilter,
    resetFilters,
    saveFavorite,
    applyFavorite,
    removeFavorite,
  } = usePersistentPageFilters('resources', filterDefinitions);

  const editingResource = useMemo(
    () => data.resources.find((resource) => resource.id === editingResourceId),
    [data.resources, editingResourceId],
  );
  const editingAllocation = useMemo(
    () => data.allocations.find((allocation) => allocation.id === editingAllocationId),
    [data.allocations, editingAllocationId],
  );
  const sortedResources = useMemo(() => sortResources(data.resources), [data.resources]);
  const resourceTypeOptions = useMemo(
    () => sortResourceTypesForSelection(data.resourceTypes),
    [data.resourceTypes],
  );
  const companyOptions = useMemo(() => sortCompaniesForSelection(data.companies), [data.companies]);
  const projectOptions = useMemo(() => sortProjectsForAllocation(data.projects), [data.projects]);
  const resourceTypeLookup = useMemo(
    () => new Map(data.resourceTypes.map((resourceType) => [resourceType.id, resourceType])),
    [data.resourceTypes],
  );
  const companyLookup = useMemo(
    () => new Map(data.companies.map((company) => [company.id, company])),
    [data.companies],
  );
  const resourceRows = useMemo(() => {
    const normalizedSearch = filters.searchTerm.trim().toUpperCase();

    return sortedResources.filter((resource) => {
      const resourceType = resourceTypeLookup.get(resource.resourceTypeId);
      const resourceTypeSearchText = resourceType
        ? `${resourceType.label} ${resourceType.shortCode ?? ''}`.toUpperCase()
        : '';
      const companyName = companyLookup.get(resource.companyId ?? '')?.name.toUpperCase() ?? '';
      const matchesStatus =
        filters.statusFilter === 'all' || resource.status === filters.statusFilter;
      const matchesType =
        filters.resourceTypeFilter === 'all' ||
        resource.resourceTypeId === filters.resourceTypeFilter;
      const matchesCompany =
        filters.companyFilter === 'all' || (resource.companyId ?? '') === filters.companyFilter;
      const matchesCollaboration =
        filters.collaborationTypeFilter === 'all' ||
        resource.collaborationType === filters.collaborationTypeFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        getResourceFullName(resource).toUpperCase().includes(normalizedSearch) ||
        resourceTypeSearchText.includes(normalizedSearch) ||
        companyName.includes(normalizedSearch);

      return (
        matchesStatus && matchesType && matchesCompany && matchesCollaboration && matchesSearch
      );
    });
  }, [
    companyLookup,
    filters.collaborationTypeFilter,
    filters.companyFilter,
    filters.resourceTypeFilter,
    filters.searchTerm,
    filters.statusFilter,
    resourceTypeLookup,
    sortedResources,
  ]);
  const filterFields = useMemo<FilterBarField[]>(
    () => [
      {
        type: 'search',
        key: 'searchTerm',
        label: 'Search resources',
        value: filters.searchTerm,
        placeholder: 'Search by name, company, or resource type',
        onChange: (value) => updateFilter('searchTerm', value),
      },
      {
        type: 'single-select',
        key: 'statusFilter',
        label: 'Status filter',
        value: filters.statusFilter,
        options: [
          { value: 'all', label: 'All statuses' },
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ],
        onChange: (value) => updateFilter('statusFilter', value as StatusFilter),
      },
      {
        type: 'single-select',
        key: 'resourceTypeFilter',
        label: 'Resource type',
        value: filters.resourceTypeFilter,
        options: [
          { value: 'all', label: 'All resource types' },
          ...resourceTypeOptions.map((resourceType) => ({
            value: resourceType.id,
            label: getResourceTypeDisplayLabel(resourceType),
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
          ...companyOptions.map((company) => ({
            value: company.id,
            label: company.name,
          })),
        ],
        onChange: (value) => updateFilter('companyFilter', value),
      },
      {
        type: 'single-select',
        key: 'collaborationTypeFilter',
        label: 'Collaboration type',
        value: filters.collaborationTypeFilter,
        options: [
          { value: 'all', label: 'All collaboration types' },
          { value: 'internal', label: 'Internal' },
          { value: 'external', label: 'External' },
        ],
        onChange: (value) =>
          updateFilter(
            'collaborationTypeFilter',
            value as ResourceFilters['collaborationTypeFilter'],
          ),
      },
    ],
    [
      companyOptions,
      filters.collaborationTypeFilter,
      filters.companyFilter,
      filters.resourceTypeFilter,
      filters.searchTerm,
      filters.statusFilter,
      resourceTypeOptions,
      updateFilter,
    ],
  );
  const resourceAllocations = useMemo(
    () =>
      sortAllocations(
        data.allocations.filter((allocation) => allocation.resourceId === editingResourceId),
      ),
    [data.allocations, editingResourceId],
  );
  const resourceValidationSchema = useMemo(
    () =>
      createResourceFormSchema(
        data.resourceTypes,
        data.companies,
        data.allocations,
        editingResource,
      ),
    [data.allocations, data.companies, data.resourceTypes, editingResource],
  );
  const allocationValidationSchema = useMemo(
    () =>
      editingResource
        ? createAllocationFormSchema(editingResource, data.resourceTypes, data.projects)
        : null,
    [data.projects, data.resourceTypes, editingResource],
  );
  const resourceResolver = useMemo(
    () =>
      (async (values: ResourceFormValues) =>
        buildResolverResult(
          resourceValidationSchema,
          values,
        )) as unknown as Resolver<ResourceFormValues>,
    [resourceValidationSchema],
  );

  const resourceForm = useForm<ResourceFormValues>({
    defaultValues: createResourceDefaultValues(),
    resolver: resourceResolver,
  });
  const allocationResolver: Resolver<AllocationFormValues> = async (values) => {
    if (!allocationValidationSchema) {
      return {
        values: values as AllocationFormValues,
        errors: {},
      };
    }

    return buildResolverResult(allocationValidationSchema, values) as Awaited<
      ReturnType<Resolver<AllocationFormValues>>
    >;
  };
  const allocationForm = useForm<AllocationFormValues>({
    defaultValues: createAllocationDefaultValues(),
    resolver: allocationResolver,
  });

  const collaborationType = resourceForm.watch('collaborationType');
  const allocationDraftValues = allocationForm.watch();
  const allocationPreview = useMemo(
    () =>
      editingResource
        ? createAllocationPreview(allocationDraftValues, editingResource.id, editingAllocation?.id)
        : null,
    [allocationDraftValues, editingAllocation?.id, editingResource],
  );
  const allocationDemandPreview = useMemo(() => {
    if (!allocationPreview) {
      return null;
    }

    return buildAllocationDemandStatus({
      allocation: allocationPreview,
      allAllocations: data.allocations,
      demandSnapshots: data.demandSnapshots,
    });
  }, [allocationPreview, data.allocations, data.demandSnapshots]);
  const resourceSummary = useMemo(() => {
    if (!editingResource) {
      return null;
    }

    return buildResourceMonthlySummary({
      resource: editingResource,
      year: summaryYear,
      month: summaryMonth,
      workingDaysCalendars: data.workingDaysCalendars,
      resourceNonWorkingDays: data.resourceNonWorkingDays,
      allocations: data.allocations,
      appSettings: data.appSettings,
    });
  }, [
    data.allocations,
    data.appSettings,
    data.resourceNonWorkingDays,
    data.workingDaysCalendars,
    editingResource,
    summaryMonth,
    summaryYear,
  ]);
  const allocationPreviewSummary = useMemo(() => {
    if (!editingResource || !allocationPreview) {
      return null;
    }

    const previewAllocations = [
      ...data.allocations.filter((allocation) => allocation.id !== allocationPreview.id),
      allocationPreview,
    ];

    return buildResourceMonthlySummary({
      resource: editingResource,
      year: allocationPreview.year,
      month: allocationPreview.month,
      workingDaysCalendars: data.workingDaysCalendars,
      resourceNonWorkingDays: data.resourceNonWorkingDays,
      allocations: previewAllocations,
      appSettings: data.appSettings,
    });
  }, [
    allocationPreview,
    data.allocations,
    data.appSettings,
    data.resourceNonWorkingDays,
    data.workingDaysCalendars,
    editingResource,
  ]);

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
        projects,
        demandSnapshots,
        workingDaysCalendars,
        resourceNonWorkingDays,
        appSettings,
      ] = await Promise.all([
        resourcesRepository.getAll(),
        resourceTypesRepository.getAll(),
        companiesRepository.getAll(),
        allocationsRepository.getAll(),
        projectsRepository.getAll(),
        demandSnapshotsRepository.getAll(),
        workingDaysCalendarsRepository.getAll(),
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
        projects,
        demandSnapshots,
        workingDaysCalendars,
        resourceNonWorkingDays,
        appSettings: appSettings ?? null,
      });
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  function openResourceEditor(resource?: Resource) {
    setEditingResourceId(resource?.id);
    setEditingAllocationId(undefined);
    resourceForm.reset(createResourceDefaultValues(resource));
    allocationForm.reset(createAllocationDefaultValues(undefined, resource));
  }

  function openAllocationEditor(allocation?: Allocation) {
    setEditingAllocationId(allocation?.id);
    allocationForm.reset(createAllocationDefaultValues(allocation, editingResource));
  }

  async function handleResourceSubmit(values: ResourceFormValues) {
    setResourceSubmitting(true);
    setFeedback('');

    try {
      const timestamp = nowIso();
      const resourceId = editingResource?.id ?? crypto.randomUUID();
      const payload: Resource = editingResource
        ? {
            ...editingResource,
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            resourceTypeId: values.resourceTypeId,
            collaborationType: values.collaborationType,
            companyId: values.companyId.trim() || undefined,
            startDate: values.startDate.trim() || undefined,
            endDate: values.endDate.trim() || undefined,
            status: values.status,
            updatedAt: timestamp,
          }
        : {
            id: resourceId,
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            resourceTypeId: values.resourceTypeId,
            collaborationType: values.collaborationType,
            companyId: values.companyId.trim() || undefined,
            startDate: values.startDate.trim() || undefined,
            endDate: values.endDate.trim() || undefined,
            status: values.status,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      await resourcesRepository.put(payload);
      await loadData();
      setEditingResourceId(resourceId);
      setEditingAllocationId(undefined);
      resourceForm.reset(createResourceDefaultValues(payload));
      allocationForm.reset(createAllocationDefaultValues(undefined, payload));
      setFeedback(editingResource ? 'Resource updated.' : 'Resource created.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save resource.');
    } finally {
      setResourceSubmitting(false);
    }
  }

  async function handleAllocationSubmit(values: AllocationFormValues) {
    if (!editingResource) {
      return;
    }

    setAllocationSubmitting(true);
    setFeedback('');

    try {
      const timestamp = nowIso();
      const allocationId = editingAllocation?.id ?? crypto.randomUUID();
      const payload: Allocation = editingAllocation
        ? {
            ...editingAllocation,
            projectCode: values.projectCode,
            resourceTypeId: values.resourceTypeId,
            year: values.year,
            month: values.month,
            allocatedDays: values.allocatedDays,
            origin: values.origin,
            updatedAt: timestamp,
          }
        : {
            id: allocationId,
            resourceId: editingResource.id,
            projectCode: values.projectCode,
            resourceTypeId: values.resourceTypeId,
            year: values.year,
            month: values.month,
            allocatedDays: values.allocatedDays,
            origin: values.origin,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      await allocationsRepository.put(payload);
      await loadData();
      setEditingAllocationId(undefined);
      allocationForm.reset(createAllocationDefaultValues(undefined, editingResource));
      setSummaryYear(payload.year);
      setSummaryMonth(payload.month);
      setFeedback(editingAllocation ? 'Allocation updated.' : 'Allocation created.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save allocation.');
    } finally {
      setAllocationSubmitting(false);
    }
  }

  async function confirmPendingResourceAction() {
    if (!pendingResourceAction) {
      return;
    }

    setBusyResourceAction(true);
    setFeedback('');

    try {
      if (pendingResourceAction.type === 'delete') {
        await resourcesRepository.delete(pendingResourceAction.resource.id);

        if (editingResourceId === pendingResourceAction.resource.id) {
          openResourceEditor(undefined);
        }

        setFeedback('Resource deleted permanently.');
      } else {
        await resourcesRepository.put({
          ...pendingResourceAction.resource,
          status: pendingResourceAction.type === 'archive' ? 'archived' : 'active',
          updatedAt: nowIso(),
        });
        setFeedback(
          pendingResourceAction.type === 'archive' ? 'Resource archived.' : 'Resource restored.',
        );
      }

      setPendingResourceAction(null);
      await loadData();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to complete the action.');
    } finally {
      setBusyResourceAction(false);
    }
  }

  async function confirmPendingAllocationAction() {
    if (!pendingAllocationAction) {
      return;
    }

    setBusyAllocationAction(true);
    setFeedback('');

    try {
      await allocationsRepository.delete(pendingAllocationAction.allocation.id);

      if (editingAllocationId === pendingAllocationAction.allocation.id) {
        openAllocationEditor(undefined);
      }

      setPendingAllocationAction(null);
      await loadData();
      setSummaryYear(pendingAllocationAction.allocation.year);
      setSummaryMonth(pendingAllocationAction.allocation.month);
      setFeedback('Allocation deleted.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to delete allocation.');
    } finally {
      setBusyAllocationAction(false);
    }
  }

  const resourceErrorSummary = getErrorSummary(resourceForm.formState.errors);
  const allocationErrorSummary = getErrorSummary(allocationForm.formState.errors);
  const currentReferenceCount = editingResource
    ? countResourceReferences(
        {
          allocations: data.allocations,
          nonWorkingDays: data.resourceNonWorkingDays,
        },
        editingResource.id,
      )
    : 0;
  const displayPrecision = data.appSettings?.displayPrecision ?? 1;

  return (
    <div className="flex w-full flex-col gap-6 p-6" id="resources-page">
      <PageHeader
        description="Manage resource records, activity dates, and monthly allocations. In Lot 6, the basic allocation CRUD surface lives inside the resource detail panel until the dedicated Allocation Studio lot lands."
        descriptionClassName="max-w-4xl"
        icon={Users}
        title="Resources"
      />

      <FeedbackMessage message={feedback} />

      <section className="ui-shadow-sm rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Resource list</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Open a resource to edit its details and manage its monthly allocations.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              openResourceEditor(undefined);
              setIsFormOpen(true);
            }}
          >
            New resource
          </Button>
        </div>

        <div className="mb-4">
          <FilterBar
            favorites={favorites}
            fields={filterFields}
            onApplyFavorite={applyFavorite}
            onDeleteFavorite={removeFavorite}
            onReset={resetFilters}
            onSaveFavorite={saveFavorite}
            resultsSummary={`${resourceRows.length} resource(s)`}
          />
        </div>

        {loading ? (
          <Skeleton label="Loading resources…" lines={4} />
        ) : (
          <TableShell
            caption="Resources with type, collaboration mode, history references, and actions."
            zebra
          >
            <thead>
              <tr className="border-b border-[var(--surf-divider)]">
                <th className="px-3 py-2 font-semibold" scope="col">
                  Name
                </th>
                <th className="px-3 py-2 font-semibold" scope="col">
                  Type
                </th>
                <th className="px-3 py-2 font-semibold" scope="col">
                  Collaboration
                </th>
                <th className="px-3 py-2 font-semibold" scope="col">
                  Company
                </th>
                <th className="px-3 py-2 font-semibold" scope="col">
                  Status
                </th>
                <th className="px-3 py-2 font-semibold" scope="col">
                  References
                </th>
                <th className="px-3 py-2 font-semibold" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {resourceRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4" colSpan={7}>
                    <EmptyState icon={Users} title="No resources match the current filters." />
                  </td>
                </tr>
              ) : null}

              {resourceRows.map((resource) => {
                const referenceCount = countResourceReferences(
                  {
                    allocations: data.allocations,
                    nonWorkingDays: data.resourceNonWorkingDays,
                  },
                  resource.id,
                );
                const canDelete = referenceCount === 0;

                return (
                  <tr className="border-b border-[var(--surf-divider)] align-top" key={resource.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium">{getResourceFullName(resource)}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        {resource.startDate ? `Start ${resource.startDate}` : 'Start not set'}
                        {resource.endDate ? ` · End ${resource.endDate}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const resourceType = resourceTypeLookup.get(resource.resourceTypeId);
                        return resourceType ? (
                          <span title={resourceType.label}>
                            {getResourceTypeDisplayLabel(resourceType)}
                          </span>
                        ) : (
                          'Unknown type'
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3">{resource.collaborationType}</td>
                    <td className="px-3 py-3">
                      {companyLookup.get(resource.companyId ?? '')?.name ?? '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                          resource.status === 'active'
                            ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                            : 'border-[var(--status-caution-border)] bg-[var(--status-caution-bg)] text-[var(--status-caution-text)]'
                        }`}
                      >
                        {resource.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">{referenceCount}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSummaryYear(initialDate.getFullYear());
                            setSummaryMonth(initialDate.getMonth() + 1);
                            openResourceEditor(resource);
                            setIsFormOpen(true);
                          }}
                        >
                          Edit details
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setPendingResourceAction({
                              type: resource.status === 'active' ? 'archive' : 'restore',
                              resource,
                              referenceCount,
                            })
                          }
                        >
                          {resource.status === 'active' ? 'Archive' : 'Restore'}
                        </Button>
                        {canDelete ? (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              setPendingResourceAction({
                                type: 'delete',
                                resource,
                                referenceCount,
                              })
                            }
                          >
                            Delete permanently
                          </Button>
                        ) : (
                          <span className="text-xs text-[var(--text-secondary)]">
                            Archive only: resource has allocation or absence history.
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </section>

      <Drawer
        description={
          editingResource
            ? `Editing ${getResourceFullName(editingResource)}.`
            : 'Create a resource and then manage its allocations from the same panel.'
        }
        headerActions={
          editingResource ? (
            <Button
              className="underline"
              size="sm"
              variant="ghost"
              onClick={() => openResourceEditor(undefined)}
            >
              Clear
            </Button>
          ) : null
        }
        onClose={() => setIsFormOpen(false)}
        open={isFormOpen}
        title={editingResource ? 'Resource details' : 'Create resource'}
        widthClassName="sm:max-w-4xl"
      >
        {resourceErrorSummary.length > 0 ? (
          <div
            className="mb-4 rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm"
            role="alert"
          >
            <p className="font-semibold">Please correct the following:</p>
            <ul className="mt-2 list-disc pl-5">
              {resourceErrorSummary.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <form
          className="space-y-4"
          onSubmit={resourceForm.handleSubmit((values: ResourceFormValues) => {
            void handleResourceSubmit(values);
          })}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="resource-first-name">
                First name
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-first-name"
                type="text"
                {...resourceForm.register('firstName')}
              />
              {resourceForm.formState.errors.firstName ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {resourceForm.formState.errors.firstName.message}
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="resource-last-name">
                Last name
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-last-name"
                type="text"
                {...resourceForm.register('lastName')}
              />
              {resourceForm.formState.errors.lastName ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {resourceForm.formState.errors.lastName.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="resource-resource-type">
                Resource type
              </label>
              <select
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-resource-type"
                {...resourceForm.register('resourceTypeId')}
              >
                <option value="">Select a resource type</option>
                {resourceTypeOptions.map((resourceType) => (
                  <option key={resourceType.id} value={resourceType.id}>
                    {getResourceTypeDisplayLabel(resourceType)}
                    {resourceType.status === 'archived' ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
              {resourceForm.formState.errors.resourceTypeId ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {resourceForm.formState.errors.resourceTypeId.message}
                </p>
              ) : null}
            </div>
            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="resource-collaboration-type"
              >
                Collaboration type
              </label>
              <select
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-collaboration-type"
                {...resourceForm.register('collaborationType')}
              >
                <option value="internal">internal</option>
                <option value="external">external</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="resource-company">
              Company
            </label>
            <select
              aria-describedby="resource-company-help"
              className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
              id="resource-company"
              {...resourceForm.register('companyId')}
            >
              <option value="">
                {collaborationType === 'external' ? 'Select a company' : 'No company selected'}
              </option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                  {company.status === 'archived' ? ' (archived)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-secondary)]" id="resource-company-help">
              {collaborationType === 'external'
                ? 'Required because the resource is external.'
                : 'Optional for internal resources.'}
            </p>
            {resourceForm.formState.errors.companyId ? (
              <p className="mt-1 text-sm text-red-400" role="alert">
                {resourceForm.formState.errors.companyId.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="resource-start-date">
                Start date
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-start-date"
                type="date"
                {...resourceForm.register('startDate')}
              />
              {resourceForm.formState.errors.startDate ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {resourceForm.formState.errors.startDate.message}
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="resource-end-date">
                End date
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-end-date"
                type="date"
                {...resourceForm.register('endDate')}
              />
              {resourceForm.formState.errors.endDate ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {resourceForm.formState.errors.endDate.message}
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="resource-status">
                Status
              </label>
              <select
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="resource-status"
                {...resourceForm.register('status')}
              >
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </div>
          </div>

          {editingResource ? (
            <p className="text-sm text-[var(--text-secondary)]">
              This resource currently has {currentReferenceCount} historical references across
              allocations and non-working days.
            </p>
          ) : null}

          <Button busy={resourceSubmitting} type="submit">
            {resourceSubmitting ? 'Saving…' : editingResource ? 'Save changes' : 'Create resource'}
          </Button>
        </form>

        {editingResource && resourceSummary ? (
          <section className="ui-shadow-sm rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Monthly resource summary</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Capacity and utilization reuse the Lot 3 calculation engine and the working-day
                  calendars configured in Lots 4 and 5.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="summary-year">
                    Year
                  </label>
                  <input
                    className="w-28 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                    id="summary-year"
                    inputMode="numeric"
                    type="number"
                    value={summaryYear}
                    onChange={(event) =>
                      setSummaryYear(Number(event.target.value) || initialDate.getFullYear())
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="summary-month">
                    Month
                  </label>
                  <select
                    className="w-40 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                    id="summary-month"
                    value={summaryMonth}
                    onChange={(event) => setSummaryMonth(Number(event.target.value))}
                  >
                    {MONTH_LABELS.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {!resourceSummary.workingDaysConfigured ? (
              <div
                className="mb-4 rounded-lg border border-[var(--status-caution-border)] bg-[var(--status-caution-bg)] px-4 py-3 text-sm text-[var(--status-caution-text)]"
                role="note"
              >
                Working days are not configured for {getMonthLabel(summaryMonth)} {summaryYear}.
                Gross and net capacities are therefore shown as 0 until a calendar entry exists.
              </div>
            ) : null}

            <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] px-4 py-3">
                <dt className="text-sm text-[var(--text-secondary)]">Gross capacity</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatDayAmount(resourceSummary.grossCapacityDays, displayPrecision)} d
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] px-4 py-3">
                <dt className="text-sm text-[var(--text-secondary)]">Non-working days</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatDayAmount(resourceSummary.nonWorkingDays, displayPrecision)} d
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] px-4 py-3">
                <dt className="text-sm text-[var(--text-secondary)]">Net capacity</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatDayAmount(resourceSummary.netCapacityDays, displayPrecision)} d
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] px-4 py-3">
                <dt className="text-sm text-[var(--text-secondary)]">Assigned load</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatDayAmount(resourceSummary.assignedLoadDays, displayPrecision)} d
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] px-4 py-3">
                <dt className="text-sm text-[var(--text-secondary)]">Available capacity</dt>
                <dd className="mt-2 text-2xl font-semibold">
                  {formatDayAmount(resourceSummary.availableCapacityDays, displayPrecision)} d
                </dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] px-4 py-3">
                <dt className="text-sm text-[var(--text-secondary)]">Utilization</dt>
                <dd className="mt-2 flex items-center gap-3">
                  <UtilizationBadge
                    displayPrecision={displayPrecision}
                    tooltip={`${getMonthLabel(summaryMonth)} ${summaryYear}: ${formatDayAmount(resourceSummary.assignedLoadDays, displayPrecision)} allocated days over ${formatDayAmount(resourceSummary.netCapacityDays, displayPrecision)} net capacity days.`}
                    utilization={resourceSummary.utilization}
                  />
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {editingResource ? (
          <section className="ui-shadow-sm rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Allocations for this resource</h2>
                <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
                  Basic monthly allocation CRUD is intentionally colocated here for Lot 6. The
                  dedicated drag-and-drop Allocation Studio arrives in a later lot.
                </p>
              </div>
              {editingAllocation ? (
                <Button
                  className="underline"
                  size="sm"
                  variant="ghost"
                  onClick={() => openAllocationEditor(undefined)}
                >
                  Clear allocation form
                </Button>
              ) : null}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_1fr]">
              <div>
                {allocationErrorSummary.length > 0 ? (
                  <div
                    className="mb-4 rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm"
                    role="alert"
                  >
                    <p className="font-semibold">Please correct the following:</p>
                    <ul className="mt-2 list-disc pl-5">
                      {allocationErrorSummary.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <form
                  className="space-y-4"
                  onSubmit={allocationForm.handleSubmit((values: AllocationFormValues) => {
                    void handleAllocationSubmit(values);
                  })}
                >
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="allocation-project">
                      Project
                    </label>
                    <select
                      className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                      id="allocation-project"
                      {...allocationForm.register('projectCode')}
                    >
                      <option value="">Select a project</option>
                      {projectOptions.map((project) => (
                        <option key={project.id} value={project.code}>
                          {project.code} — {project.name}
                          {project.status === 'archived' ? ' (archived)' : ''}
                        </option>
                      ))}
                    </select>
                    {allocationForm.formState.errors.projectCode ? (
                      <p className="mt-1 text-sm text-red-400" role="alert">
                        {allocationForm.formState.errors.projectCode.message}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      className="mb-1 block text-sm font-medium"
                      htmlFor="allocation-resource-type"
                    >
                      Allocation resource type
                    </label>
                    <select
                      className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                      id="allocation-resource-type"
                      {...allocationForm.register('resourceTypeId')}
                    >
                      <option value="">Select a resource type</option>
                      {resourceTypeOptions.map((resourceType) => {
                        const incompatible = resourceType.id !== editingResource.resourceTypeId;

                        return (
                          <option
                            disabled={incompatible}
                            key={resourceType.id}
                            value={resourceType.id}
                          >
                            {getResourceTypeDisplayLabel(resourceType)}
                            {incompatible ? ' (incompatible)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Only the resource&apos;s own type is compatible in this lot.
                    </p>
                    {allocationForm.formState.errors.resourceTypeId ? (
                      <p className="mt-1 text-sm text-red-400" role="alert">
                        {allocationForm.formState.errors.resourceTypeId.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="allocation-year">
                        Year
                      </label>
                      <input
                        className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                        id="allocation-year"
                        inputMode="numeric"
                        type="number"
                        {...allocationForm.register('year', { valueAsNumber: true })}
                      />
                      {allocationForm.formState.errors.year ? (
                        <p className="mt-1 text-sm text-red-400" role="alert">
                          {allocationForm.formState.errors.year.message}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="allocation-month">
                        Month
                      </label>
                      <select
                        className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                        id="allocation-month"
                        {...allocationForm.register('month', { valueAsNumber: true })}
                      >
                        {MONTH_LABELS.map((label, index) => (
                          <option key={label} value={index + 1}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {allocationForm.formState.errors.month ? (
                        <p className="mt-1 text-sm text-red-400" role="alert">
                          {allocationForm.formState.errors.month.message}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <label
                      className="mb-1 block text-sm font-medium"
                      htmlFor="allocation-allocated-days"
                    >
                      Allocated days
                    </label>
                    <input
                      className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                      id="allocation-allocated-days"
                      inputMode="decimal"
                      type="text"
                      {...allocationForm.register('allocatedDays', {
                        setValueAs: parseLocaleInput,
                      })}
                    />
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Decimal values are allowed. Use either a dot or a comma as the decimal
                      separator.
                    </p>
                    {allocationForm.formState.errors.allocatedDays ? (
                      <p className="mt-1 text-sm text-red-400" role="alert">
                        {allocationForm.formState.errors.allocatedDays.message}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="allocation-origin">
                      Origin
                    </label>
                    <select
                      className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                      id="allocation-origin"
                      {...allocationForm.register('origin')}
                    >
                      <option value="manual">manual</option>
                      <option value="import">import</option>
                      <option value="drag-and-drop">drag-and-drop</option>
                    </select>
                  </div>

                  {allocationPreview && allocationPreviewSummary ? (
                    <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] px-4 py-3 text-sm">
                      <p className="font-semibold">
                        Preview for {getMonthLabel(allocationPreview.month)}{' '}
                        {allocationPreview.year}
                      </p>
                      <ul className="mt-2 space-y-1 text-[var(--text-secondary)]">
                        <li>
                          Assigned load after save:{' '}
                          <span className="text-white">
                            {formatDayAmount(
                              allocationPreviewSummary.assignedLoadDays,
                              displayPrecision,
                            )}{' '}
                            d
                          </span>
                        </li>
                        <li>
                          Available capacity after save:{' '}
                          <span className="text-white">
                            {formatDayAmount(
                              allocationPreviewSummary.availableCapacityDays,
                              displayPrecision,
                            )}{' '}
                            d
                          </span>
                        </li>
                        <li>
                          Utilization after save:{' '}
                          <span className="inline-flex">
                            <UtilizationBadge
                              compact
                              displayPrecision={displayPrecision}
                              tooltip={`${getMonthLabel(allocationPreview.month)} ${allocationPreview.year}: ${formatDayAmount(allocationPreviewSummary.assignedLoadDays, displayPrecision)} allocated days over ${formatDayAmount(allocationPreviewSummary.netCapacityDays, displayPrecision)} net capacity days after save.`}
                              utilization={allocationPreviewSummary.utilization}
                            />
                          </span>
                        </li>
                      </ul>
                      {allocationPreviewSummary.availableCapacityDays < 0 ? (
                        <p className="mt-3 text-amber-200" role="alert">
                          ⚠ Overload is allowed and will be saved. This month would exceed net
                          capacity by{' '}
                          {formatDayAmount(
                            Math.abs(allocationPreviewSummary.availableCapacityDays),
                            displayPrecision,
                          )}{' '}
                          day(s).
                        </p>
                      ) : null}
                      {allocationDemandPreview?.isOverService ? (
                        <p className="mt-3 text-amber-200" role="alert">
                          ⚠ Over-service: this allocation exceeds the remaining demand by{' '}
                          {formatDayAmount(
                            allocationDemandPreview.overServiceDays,
                            displayPrecision,
                          )}{' '}
                          day(s).
                        </p>
                      ) : allocationPreview && !allocationDemandPreview?.matchingDemandSnapshot ? (
                        <p className="mt-3 text-[var(--text-secondary)]">
                          No matching demand snapshot exists yet for this project/month/type, so
                          over-service cannot be assessed in this lot.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <Button busy={allocationSubmitting} type="submit">
                    {allocationSubmitting
                      ? 'Saving…'
                      : editingAllocation
                        ? 'Save allocation'
                        : 'Create allocation'}
                  </Button>
                </form>
              </div>

              <TableShell
                caption="Allocations linked to the selected resource with demand and utilization flags."
                zebra
              >
                <thead>
                  <tr className="border-b border-[var(--surf-divider)]">
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Project
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Type
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Period
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Days
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Origin
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Demand status
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Utilization
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resourceAllocations.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4" colSpan={8}>
                        <EmptyState
                          icon={Users}
                          title="No allocations exist for this resource yet."
                        />
                      </td>
                    </tr>
                  ) : null}

                  {resourceAllocations.map((allocation) => {
                    const demandStatus = buildAllocationDemandStatus({
                      allocation,
                      allAllocations: data.allocations,
                      demandSnapshots: data.demandSnapshots,
                    });
                    const allocationSummary = buildResourceMonthlySummary({
                      resource: editingResource,
                      year: allocation.year,
                      month: allocation.month,
                      workingDaysCalendars: data.workingDaysCalendars,
                      resourceNonWorkingDays: data.resourceNonWorkingDays,
                      allocations: data.allocations,
                      appSettings: data.appSettings,
                    });
                    return (
                      <tr
                        className="border-b border-[var(--surf-divider)] align-top"
                        key={allocation.id}
                      >
                        <td className="px-3 py-3">{allocation.projectCode}</td>
                        <td className="px-3 py-3">
                          {(() => {
                            const resourceType = resourceTypeLookup.get(allocation.resourceTypeId);
                            return resourceType ? (
                              <span title={resourceType.label}>
                                {getResourceTypeDisplayLabel(resourceType)}
                              </span>
                            ) : (
                              'Unknown type'
                            );
                          })()}
                        </td>
                        <td className="px-3 py-3">
                          {getMonthLabel(allocation.month)} {allocation.year}
                        </td>
                        <td className="px-3 py-3">
                          {formatDayAmount(allocation.allocatedDays, displayPrecision)} d
                        </td>
                        <td className="px-3 py-3">{allocation.origin}</td>
                        <td className="px-3 py-3">
                          {renderDemandStatus(demandStatus, displayPrecision)}
                        </td>
                        <td className="px-3 py-3">
                          <UtilizationBadge
                            compact
                            displayPrecision={displayPrecision}
                            tooltip={`${getMonthLabel(allocation.month)} ${allocation.year}: ${formatDayAmount(allocationSummary.assignedLoadDays, displayPrecision)} allocated days over ${formatDayAmount(allocationSummary.netCapacityDays, displayPrecision)} net capacity days.`}
                            utilization={allocationSummary.utilization}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openAllocationEditor(allocation)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                setPendingAllocationAction({
                                  type: 'delete',
                                  allocation,
                                })
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            </div>
          </section>
        ) : null}
      </Drawer>

      <ConfirmDialog
        busy={busyResourceAction}
        cancelLabel="Cancel"
        confirmLabel={
          pendingResourceAction?.type === 'delete'
            ? 'Delete permanently'
            : pendingResourceAction?.type === 'archive'
              ? 'Archive'
              : 'Restore'
        }
        description={
          pendingResourceAction ? (
            <div className="space-y-2">
              <p>
                {pendingResourceAction.type === 'delete'
                  ? `Permanently delete ${getResourceFullName(pendingResourceAction.resource)}?`
                  : pendingResourceAction.type === 'archive'
                    ? `Archive ${getResourceFullName(pendingResourceAction.resource)}?`
                    : `Restore ${getResourceFullName(pendingResourceAction.resource)}?`}
              </p>
              <p>
                Reference count: <strong>{pendingResourceAction.referenceCount}</strong>.
              </p>
            </div>
          ) : null
        }
        onCancel={() => setPendingResourceAction(null)}
        onConfirm={confirmPendingResourceAction}
        open={Boolean(pendingResourceAction)}
        title="Confirm resource action"
        tone={pendingResourceAction?.type === 'delete' ? 'danger' : 'default'}
      />

      <ConfirmDialog
        busy={busyAllocationAction}
        cancelLabel="Cancel"
        confirmLabel="Delete allocation"
        description={
          pendingAllocationAction ? (
            <div className="space-y-2">
              <p>
                Delete the allocation for {pendingAllocationAction.allocation.projectCode} (
                {getMonthLabel(pendingAllocationAction.allocation.month)}{' '}
                {pendingAllocationAction.allocation.year})?
              </p>
              <p>This action permanently removes the allocation row.</p>
            </div>
          ) : null
        }
        onCancel={() => setPendingAllocationAction(null)}
        onConfirm={confirmPendingAllocationAction}
        open={Boolean(pendingAllocationAction)}
        title="Confirm allocation deletion"
        tone="danger"
      />
    </div>
  );
}

function renderDemandStatus(demandStatus: AllocationDemandStatus, displayPrecision: number) {
  if (!demandStatus.matchingDemandSnapshot || demandStatus.demandDays === null) {
    return (
      <div className="space-y-1">
        <div className="text-xs text-[var(--text-secondary)]">No demand snapshot</div>
        <div className="text-xs text-[var(--text-secondary)]">
          Over-service cannot be assessed yet.
        </div>
      </div>
    );
  }

  if (demandStatus.isOverService) {
    return (
      <div className="space-y-1">
        <DemandCoverageBadge
          compact
          displayPrecision={displayPrecision}
          summary={{
            coverageRatePercent: 100,
            remainingDemandDays: 0,
            overServiceDays: demandStatus.overServiceDays,
          }}
          tooltip={`Demand ${formatDayAmount(demandStatus.demandDays, displayPrecision)} d, total allocated ${formatDayAmount(demandStatus.totalAllocatedAfterSaveDays, displayPrecision)} d, over-service ${formatDayAmount(demandStatus.overServiceDays, displayPrecision)} d.`}
        />
        <div className="text-xs text-[var(--text-secondary)]">
          Demand {formatDayAmount(demandStatus.demandDays, displayPrecision)} d · total allocated{' '}
          {formatDayAmount(demandStatus.totalAllocatedAfterSaveDays, displayPrecision)} d
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <DemandCoverageBadge
        compact
        displayPrecision={displayPrecision}
        summary={{
          coverageRatePercent: 100,
          remainingDemandDays: 0,
          overServiceDays: 0,
        }}
        tooltip={`Demand covered within limit. Remaining before this allocation ${formatDayAmount(demandStatus.remainingDemandBeforeAllocationDays ?? 0, displayPrecision)} d.`}
      />
      <div className="text-xs text-[var(--text-secondary)]">
        Remaining before this allocation{' '}
        {formatDayAmount(demandStatus.remainingDemandBeforeAllocationDays ?? 0, displayPrecision)} d
      </div>
    </div>
  );
}
