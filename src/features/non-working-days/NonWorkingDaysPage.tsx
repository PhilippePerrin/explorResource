import { useEffect, useMemo, useState } from 'react';

import { FeedbackMessage } from '@/components/FeedbackMessage';
import type { Resource, ResourceNonWorkingDays } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';
import { ConfirmDialog } from '@/components/ConfirmDialog';

import {
  MONTH_LABELS,
  applyClipboardGrid,
  buildNonWorkingDayRows,
  calculateNonWorkingDayTotals,
  createNonWorkingDayMutationPlan,
  duplicateNonWorkingDayRows,
  parseClipboardGrid,
  setNonWorkingDayValue,
  type NonWorkingDayRow,
} from './nonWorkingDaysModel';

const resourcesRepository = createRepository('resources');
const nonWorkingDaysRepository = createRepository('resourceNonWorkingDays');

interface NonWorkingDaysPageData {
  resources: Resource[];
  entries: ResourceNonWorkingDays[];
}

export function NonWorkingDaysPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [data, setData] = useState<NonWorkingDaysPageData>({ resources: [], entries: [] });
  const [rows, setRows] = useState<NonWorkingDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    void loadYear(selectedYear);
  }, [selectedYear]);

  async function loadYear(year: number) {
    setLoading(true);

    try {
      const [resources, allEntries] = await Promise.all([
        resourcesRepository.getAll(),
        nonWorkingDaysRepository.getByIndex(
          'by-year-month',
          IDBKeyRange.bound([year, 1], [year, 12]),
        ),
      ]);
      const entries = allEntries.filter((entry) => entry.year === year);
      setData({ resources, entries });
      setRows(buildNonWorkingDayRows(resources, entries));
      setValidationMessage('');
    } finally {
      setLoading(false);
    }
  }

  function validateRows(nextRows: readonly NonWorkingDayRow[]): boolean {
    const invalidCell = nextRows.some((row) =>
      row.values.some((value) => !Number.isFinite(value) || value < 0),
    );

    if (invalidCell) {
      setValidationMessage('Non-working days must be non-negative numbers.');
      return false;
    }

    setValidationMessage('');
    return true;
  }

  async function handleSave() {
    if (!validateRows(rows)) {
      return;
    }

    setSaving(true);
    setFeedback('');

    try {
      const timestamp = new Date().toISOString();
      const mutationPlan = createNonWorkingDayMutationPlan(
        selectedYear,
        rows,
        data.entries,
        timestamp,
      );
      await Promise.all([
        ...mutationPlan.upserts.map((entry) => nonWorkingDaysRepository.put(entry)),
        ...mutationPlan.deletes.map((entryId) => nonWorkingDaysRepository.delete(entryId)),
      ]);
      await loadYear(selectedYear);
      setFeedback(`Non-working days saved for ${selectedYear}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save non-working days.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicateYear() {
    if (!validateRows(rows)) {
      return;
    }

    setDuplicating(true);
    setFeedback('');

    try {
      const targetYear = selectedYear + 1;
      const targetEntries = await nonWorkingDaysRepository.getByIndex(
        'by-year-month',
        IDBKeyRange.bound([targetYear, 1], [targetYear, 12]),
      );
      const duplicatedRows = duplicateNonWorkingDayRows(rows);
      const timestamp = new Date().toISOString();
      const mutationPlan = createNonWorkingDayMutationPlan(
        targetYear,
        duplicatedRows,
        targetEntries.filter((entry) => entry.year === targetYear),
        timestamp,
      );
      await Promise.all([
        ...mutationPlan.upserts.map((entry) => nonWorkingDaysRepository.put(entry)),
        ...mutationPlan.deletes.map((entryId) => nonWorkingDaysRepository.delete(entryId)),
      ]);
      setShowDuplicateDialog(false);
      setSelectedYear(targetYear);
      setFeedback(`Non-working days duplicated from ${selectedYear} to ${targetYear}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to duplicate non-working days.');
    } finally {
      setDuplicating(false);
    }
  }

  const totals = useMemo(() => calculateNonWorkingDayTotals(rows), [rows]);

  return (
    <div
      className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 p-6"
      id="non-working-days-page"
    >
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Non-working Days</h1>
        <p className="max-w-4xl text-sm text-[var(--text-secondary)]">
          Maintain resource absences for a full year. Decimal days are allowed. Paste tab/newline
          ranges directly from Excel into any cell to populate multiple months and resources at
          once.
        </p>
      </header>

      <div aria-live="polite" className="sr-only">
        {validationMessage}
      </div>

      <FeedbackMessage message={feedback} />

      {validationMessage ? (
        <div
          className="rounded-lg border border-red-500/50 bg-red-950/20 px-4 py-3 text-sm"
          role="alert"
        >
          {validationMessage}
        </div>
      ) : null}

      <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <button
              className="rounded-md border border-[var(--surf-divider)] px-3 py-2"
              onClick={() => setSelectedYear((year) => year - 1)}
              type="button"
            >
              Previous year
            </button>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="non-working-days-year">
                Year
              </label>
              <input
                className="w-32 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="non-working-days-year"
                inputMode="numeric"
                type="text"
                value={selectedYear}
                onChange={(event) => {
                  const nextYear = Number(event.target.value);

                  if (Number.isInteger(nextYear)) {
                    setSelectedYear(nextYear);
                  }
                }}
              />
            </div>
            <button
              className="rounded-md border border-[var(--surf-divider)] px-3 py-2"
              onClick={() => setSelectedYear((year) => year + 1)}
              type="button"
            >
              Next year
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-md border border-[var(--color-bmx-blue)] px-4 py-2 text-sm font-medium"
              onClick={() => setShowDuplicateDialog(true)}
              type="button"
            >
              Duplicate year
            </button>
            <button
              className="rounded-md bg-[var(--color-bmx-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
              disabled={saving}
              onClick={() => {
                void handleSave();
              }}
              type="button"
            >
              {saving ? 'Saving…' : 'Save grid'}
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading non-working days…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No resources exist yet. Create resources in the dedicated lot, then return here to
            manage per-resource non-working days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[74rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Resource by month grid for non-working days with row and column totals.
              </caption>
              <thead>
                <tr className="border-b border-[var(--surf-divider)]">
                  <th
                    className="sticky left-0 z-10 bg-[var(--surf-800)] px-3 py-2 font-semibold"
                    scope="col"
                  >
                    Resource
                  </th>
                  {MONTH_LABELS.map((monthLabel) => (
                    <th className="px-3 py-2 font-semibold" key={monthLabel} scope="col">
                      {monthLabel}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-semibold" scope="col">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr className="border-b border-[var(--surf-divider)]" key={row.resourceId}>
                    <th className="sticky left-0 z-10 bg-[var(--surf-800)] px-3 py-3" scope="row">
                      <div className="font-medium">{row.resourceName}</div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Status: {row.resourceStatus}
                      </div>
                    </th>
                    {row.values.map((value, monthIndex) => (
                      <td className="px-3 py-2" key={`${row.resourceId}-${monthIndex + 1}`}>
                        <label
                          className="sr-only"
                          htmlFor={`non-working-${row.resourceId}-${monthIndex + 1}`}
                        >
                          {row.resourceName} {MONTH_LABELS[monthIndex]} non-working days
                        </label>
                        <input
                          className="w-20 rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-2 py-1.5"
                          id={`non-working-${row.resourceId}-${monthIndex + 1}`}
                          inputMode="decimal"
                          type="text"
                          value={Number.isFinite(value) ? value : ''}
                          onChange={(event) => {
                            const nextRows = setNonWorkingDayValue(
                              rows,
                              rowIndex,
                              monthIndex,
                              event.target.value,
                            );
                            setRows(nextRows);
                            validateRows(nextRows);
                          }}
                          onPaste={(event) => {
                            const clipboardText = event.clipboardData.getData('text/plain');
                            const clipboardGrid = parseClipboardGrid(clipboardText);

                            if (clipboardGrid.length <= 1 && (clipboardGrid[0]?.length ?? 0) <= 1) {
                              return;
                            }

                            event.preventDefault();
                            const nextRows = applyClipboardGrid(
                              rows,
                              rowIndex,
                              monthIndex,
                              clipboardGrid,
                            );
                            setRows(nextRows);
                            validateRows(nextRows);
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-3 font-semibold">
                      {totals.rowTotals[row.resourceId] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    className="sticky left-0 z-10 bg-[var(--surf-800)] px-3 py-3 text-base font-semibold"
                    scope="row"
                  >
                    Monthly totals
                  </th>
                  {totals.columnTotals.map((total, monthIndex) => (
                    <td
                      className="px-3 py-3 text-base font-semibold"
                      key={`column-total-${monthIndex + 1}`}
                    >
                      {total}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-base font-semibold">{totals.grandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        busy={duplicating}
        confirmLabel="Duplicate year"
        description={
          <p>
            Copy all {rows.length} resource rows from {selectedYear} into {selectedYear + 1}. Any
            existing target-year values will be overwritten.
          </p>
        }
        onCancel={() => setShowDuplicateDialog(false)}
        onConfirm={handleDuplicateYear}
        open={showDuplicateDialog}
        title="Duplicate non-working days to next year"
      />
    </div>
  );
}
