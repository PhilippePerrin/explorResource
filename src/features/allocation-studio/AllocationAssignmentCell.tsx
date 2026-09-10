import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { useDroppable } from '@dnd-kit/core';

import { formatDayAmount } from '@/components/formatDayAmount';

export interface AllocationAssignmentCellProps {
  resourceName: string;
  allocatedDays: number;
  projectCode: string;
  resourceTypeId: string;
  year: number;
  month: number;
  label: string;
  rowIndex: number;
  monthIndex: number;
  displayPrecision: number;
  onCommit: (allocatedDays: number) => void;
  onGridKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

const DIGIT_KEY_PATTERN = /^[0-9.]$/;

function parseDraftValue(draftValue: string): number | null {
  const trimmed = draftValue.trim();

  if (trimmed.length === 0) {
    return 0;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Per-resource, per-month cell for an assignment row. Shares the same
 * drop::project::type::year::month id as AllocationBoardCell (the
 * demand-line cell) so both rows are equivalent single-month drop targets
 * for a "move" drag; this cell renders a plain day value rather than a
 * coverage bar, since a single resource's allocation has no gap of its own.
 *
 * Editing happens inline (spreadsheet-style) rather than through the
 * QuickAssignDrawer: resource/project/type/month are already fixed for this
 * cell, so opening a multi-field form for a single number was pure overhead.
 * The drawer stays reserved for adding a *new* resource to a project, where
 * picking the resource/type still has meaning.
 */
export function AllocationAssignmentCell({
  resourceName,
  allocatedDays,
  projectCode,
  resourceTypeId,
  year,
  month,
  label,
  rowIndex,
  monthIndex,
  displayPrecision,
  onCommit,
  onGridKeyDown,
}: AllocationAssignmentCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop::${projectCode}::${resourceTypeId}::${year}::${month}`,
  });
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipCommitRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const formattedDays = formatDayAmount(allocatedDays, displayPrecision);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  function startEditing(initialValue?: string) {
    setError(null);
    setDraftValue(initialValue ?? (allocatedDays > 0 ? String(allocatedDays) : ''));
    setIsEditing(true);
  }

  function handleButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();

      if (allocatedDays !== 0) {
        onCommit(0);
      }

      return;
    }

    if (DIGIT_KEY_PATTERN.test(event.key)) {
      event.preventDefault();
      startEditing(event.key);
      return;
    }

    onGridKeyDown(event);
  }

  function commitDraft() {
    const parsed = parseDraftValue(draftValue);

    if (parsed === null || parsed < 0) {
      setError('Enter a valid, non-negative number of days.');
      inputRef.current?.focus();
      return;
    }

    setIsEditing(false);
    setError(null);

    if (parsed !== allocatedDays) {
      onCommit(parsed);
    }
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      skipCommitRef.current = true;
      setError(null);
      setIsEditing(false);
    }
  }

  function handleInputBlur() {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }

    commitDraft();
  }

  return (
    <div
      className={`min-w-[8rem] rounded-lg border p-2 text-xs ${
        isOver
          ? 'border-[var(--color-bmx-blue)] bg-[var(--surf-600)]'
          : 'border-[var(--surf-divider)] bg-[var(--surf-700)]'
      }`}
      ref={setNodeRef}
    >
      {isEditing ? (
        <>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-label={`${resourceName} in ${projectCode}, month ${label}: days allocated`}
            className={`w-full rounded-md border bg-[var(--surf-800)] p-1 text-right focus:outline-none focus:ring-2 focus:ring-[var(--color-bmx-blue)] ${
              error ? 'border-red-400' : 'border-[var(--surf-divider)]'
            }`}
            data-grid-cell="true"
            data-month-index={monthIndex}
            data-row-index={rowIndex}
            min={0}
            ref={inputRef}
            step="0.1"
            type="number"
            value={draftValue}
            onBlur={handleInputBlur}
            onChange={(event) => setDraftValue(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          {error ? (
            <p className="mt-1 text-red-300" id={errorId} role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <button
          aria-label={`${resourceName} in ${projectCode}, month ${label}: ${
            allocatedDays > 0 ? `${formattedDays} d` : 'no allocation'
          }. Press Enter, Space, or a digit to edit. Press Delete to clear.`}
          className="w-full rounded-md border border-transparent p-1 text-right hover:border-[var(--surf-divider)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bmx-blue)]"
          data-grid-cell="true"
          data-month-index={monthIndex}
          data-row-index={rowIndex}
          type="button"
          onClick={() => startEditing()}
          onKeyDown={handleButtonKeyDown}
        >
          {allocatedDays > 0 ? `${formattedDays} d` : '—'}
        </button>
      )}
    </div>
  );
}
