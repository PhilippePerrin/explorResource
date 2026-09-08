import { useEffect, useMemo, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import type { Company, Resource } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';
import { ConfirmDialog } from '@/components/ConfirmDialog';

import {
  countCompanyReferences,
  createCompanyDefaultValues,
  createCompanyFormSchema,
  sortCompanies,
  type CompanyFormValues,
} from './companyUtils';

const companiesRepository = createRepository('companies');
const resourcesRepository = createRepository('resources');

interface CompaniesPageData {
  companies: Company[];
  resources: Resource[];
}

type PendingAction =
  | { type: 'archive'; company: Company }
  | { type: 'restore'; company: Company }
  | { type: 'delete'; company: Company };

function nowIso(): string {
  return new Date().toISOString();
}

function createZodResolver(
  schema: ReturnType<typeof createCompanyFormSchema>,
): Resolver<CompanyFormValues> {
  return async (values) => {
    const result = schema.safeParse(values);

    if (result.success) {
      return {
        values: result.data,
        errors: {},
      };
    }

    const fieldErrors: Record<string, { type: string; message: string }> = {};

    for (const issue of result.error.issues) {
      const path = issue.path.join('.');

      if (!path || fieldErrors[path]) {
        continue;
      }

      fieldErrors[path] = {
        type: issue.code,
        message: issue.message,
      };
    }

    return {
      values: {},
      errors: fieldErrors,
    };
  };
}

function getErrorSummary(errors: FieldErrors<CompanyFormValues>): string[] {
  return Object.values(errors)
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));
}

export function CompaniesPage() {
  const [data, setData] = useState<CompaniesPageData>({ companies: [], resources: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  const editingCompany = useMemo(
    () => data.companies.find((company) => company.id === editingCompanyId),
    [data.companies, editingCompanyId],
  );

  const sortedCompanies = useMemo(() => sortCompanies(data.companies), [data.companies]);
  const validationSchema = useMemo(
    () => createCompanyFormSchema(data.companies, editingCompanyId),
    [data.companies, editingCompanyId],
  );

  const form = useForm<CompanyFormValues>({
    defaultValues: createCompanyDefaultValues(),
    resolver: createZodResolver(validationSchema),
  });

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    form.reset(createCompanyDefaultValues(editingCompany));
  }, [editingCompany, form]);

  async function loadData() {
    setLoading(true);

    try {
      const [companies, resources] = await Promise.all([
        companiesRepository.getAll(),
        resourcesRepository.getAll(),
      ]);

      setData({ companies, resources });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(values: CompanyFormValues) {
    setSubmitting(true);
    setFeedback('');

    try {
      const timestamp = nowIso();
      const company: Company = editingCompany
        ? {
            ...editingCompany,
            name: values.name.trim(),
            updatedAt: timestamp,
          }
        : {
            id: crypto.randomUUID(),
            name: values.name.trim(),
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      await companiesRepository.put(company);
      await loadData();
      setEditingCompanyId(undefined);
      form.reset(createCompanyDefaultValues());
      setFeedback(editingCompany ? 'Company updated.' : 'Company created.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save company.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }

    setBusyAction(true);
    setFeedback('');

    try {
      const timestamp = nowIso();

      if (pendingAction.type === 'delete') {
        await companiesRepository.delete(pendingAction.company.id);

        if (editingCompanyId === pendingAction.company.id) {
          setEditingCompanyId(undefined);
          form.reset(createCompanyDefaultValues());
        }

        setFeedback('Company deleted permanently.');
      } else {
        await companiesRepository.put({
          ...pendingAction.company,
          status: pendingAction.type === 'archive' ? 'archived' : 'active',
          updatedAt: timestamp,
        });
        setFeedback(pendingAction.type === 'archive' ? 'Company archived.' : 'Company restored.');
      }

      setPendingAction(null);
      await loadData();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to complete the action.');
    } finally {
      setBusyAction(false);
    }
  }

  const errorSummary = getErrorSummary(form.formState.errors);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6" id="companies-page">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Companies</h1>
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
          Manage referential companies used by external resources. Companies are archived by
          default; permanent deletion is only available when no resource references the company.
        </p>
      </header>

      <FeedbackMessage message={feedback} />

      <section className="grid gap-6 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
        <div className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {editingCompany ? 'Edit company' : 'Create company'}
            </h2>
            {editingCompany ? (
              <button
                className="text-sm underline"
                onClick={() => {
                  setEditingCompanyId(undefined);
                  form.reset(createCompanyDefaultValues());
                }}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>

          {errorSummary.length > 0 ? (
            <div
              className="mb-4 rounded-lg border border-red-500/50 bg-red-950/20 px-4 py-3 text-sm"
              role="alert"
            >
              <p className="font-semibold">Please correct the following:</p>
              <ul className="mt-2 list-disc pl-5">
                {errorSummary.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => {
              void handleSubmit(values);
            })}
          >
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="company-name">
                Company name
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="company-name"
                type="text"
                {...form.register('name')}
              />
              {form.formState.errors.name ? (
                <p className="mt-1 text-sm text-red-400" role="alert">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <button
              className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Saving…' : editingCompany ? 'Save changes' : 'Create company'}
            </button>
          </form>
        </div>

        <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
          <h2 className="mb-4 text-xl font-semibold">Company list</h2>

          {loading ? (
            <p>Loading companies…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Companies with usage counts and available actions.
                </caption>
                <thead>
                  <tr className="border-b border-[var(--surf-divider)]">
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Name
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Status
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Resource references
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCompanies.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-[var(--text-secondary)]" colSpan={4}>
                        No companies yet.
                      </td>
                    </tr>
                  ) : null}

                  {sortedCompanies.map((company) => {
                    const referenceCount = countCompanyReferences(data.resources, company.id);
                    const canDelete = referenceCount === 0;

                    return (
                      <tr
                        className="border-b border-[var(--surf-divider)] align-top"
                        key={company.id}
                      >
                        <td className="px-3 py-3">
                          <div className="font-medium">{company.name}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                              company.status === 'active'
                                ? 'bg-green-900/40 text-green-300'
                                : 'bg-amber-900/40 text-amber-300'
                            }`}
                          >
                            {company.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">{referenceCount}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-md border border-[var(--surf-divider)] px-3 py-1.5"
                              onClick={() => setEditingCompanyId(company.id)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md border border-[var(--surf-divider)] px-3 py-1.5"
                              onClick={() =>
                                setPendingAction({
                                  type: company.status === 'active' ? 'archive' : 'restore',
                                  company,
                                })
                              }
                              type="button"
                            >
                              {company.status === 'active' ? 'Archive' : 'Restore'}
                            </button>
                            {canDelete ? (
                              <button
                                className="rounded-md border border-red-500/50 px-3 py-1.5 text-red-300"
                                onClick={() => setPendingAction({ type: 'delete', company })}
                                type="button"
                              >
                                Delete permanently
                              </button>
                            ) : (
                              <span className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                                Archive only: company is still referenced.
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      <ConfirmDialog
        busy={busyAction}
        confirmLabel={
          pendingAction?.type === 'delete'
            ? 'Delete permanently'
            : pendingAction?.type === 'archive'
              ? 'Archive'
              : 'Restore'
        }
        description={
          pendingAction ? (
            <p>
              {pendingAction.type === 'delete'
                ? `Delete "${pendingAction.company.name}" permanently? This cannot be undone.`
                : pendingAction.type === 'archive'
                  ? `Archive "${pendingAction.company.name}"? Referenced companies must stay available in history.`
                  : `Restore "${pendingAction.company.name}" to the active referential?`}
            </p>
          ) : null
        }
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
        open={pendingAction !== null}
        title={
          pendingAction?.type === 'delete'
            ? 'Confirm permanent deletion'
            : pendingAction?.type === 'archive'
              ? 'Confirm archive'
              : 'Confirm restore'
        }
        tone={pendingAction?.type === 'delete' ? 'danger' : 'default'}
      />
    </div>
  );
}
