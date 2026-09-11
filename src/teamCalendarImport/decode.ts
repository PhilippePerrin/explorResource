/**
 * Pure, framework-free decoding rules for the "Team Calendar" absence workbook.
 *
 * The source file has no cell comments (unlike the demand import) — its only
 * signals are a handful of text values and the cell's solid fill color, decoded
 * against the sheet's own legend (swatches next to the "PTO" / "Travelling" /
 * "Site closed / Bank holidays" labels in the file). See docs/import-format.md
 * for the full decoding table and how it was derived from the real file.
 */

export type CalendarFillKind = 'pto' | 'holiday' | 'travel' | 'base' | 'unrecognized' | 'none';

export interface CalendarCellStyle {
  patternType?: string;
  fgColor?: {
    rgb?: string;
    theme?: number;
    tint?: number;
  };
}

const PTO_FILL_RGB = 'C00000';
const TRAVEL_FILL_RGB = 'FFFF00';
/** The sheet's default banding fill — applied almost everywhere, not semantic. */
const BASE_FILL_RGB = 'DEEBF7';
const HOLIDAY_FILL_THEME = 0;
const HOLIDAY_FILL_TINT_THRESHOLD = -0.3;

export function classifyCalendarFill(style: CalendarCellStyle | undefined): CalendarFillKind {
  if (!style || style.patternType !== 'solid' || !style.fgColor) {
    return 'none';
  }

  const { fgColor } = style;

  if (fgColor.rgb === PTO_FILL_RGB) {
    return 'pto';
  }

  if (fgColor.rgb === TRAVEL_FILL_RGB) {
    return 'travel';
  }

  if (fgColor.rgb === BASE_FILL_RGB) {
    return 'base';
  }

  if (
    fgColor.theme === HOLIDAY_FILL_THEME &&
    typeof fgColor.tint === 'number' &&
    fgColor.tint < HOLIDAY_FILL_TINT_THRESHOLD
  ) {
    return 'holiday';
  }

  return 'unrecognized';
}

export interface CalendarCellInput {
  value: unknown;
  fillKind: CalendarFillKind;
}

export interface CalendarCellDecoding {
  days: number;
  anomaly?: 'unrecognized-marking' | 'conflicting-marking';
}

function toTrimmedText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Decodes a single grid cell into a non-working-day fraction.
 *
 * Decision table (confirmed with the file owner):
 * - Travelling (yellow fill) never counts — the resource is still working, just elsewhere.
 * - Site closed / Bank holidays (dark fill, company-wide) never counts at the resource
 *   level — assumed already reflected in the global WorkingDaysCalendar.
 * - PTO fill (dark red) with no text is a full day (1). PTO fill *with* any text
 *   (AM/PM/other) is a conflicting signal — the explicit text wins, counted as 0.5.
 * - AM/PM text alone (no PTO fill) is a half day (0.5).
 * - Any other colored-but-undocumented fill, or unrecognized text with no
 *   meaningful fill, is excluded from the total but flagged so it can be reviewed.
 */
export function decodeCalendarCell({ value, fillKind }: CalendarCellInput): CalendarCellDecoding {
  const text = toTrimmedText(value);
  const isHalfDayText = text === 'AM' || text === 'PM';

  if (fillKind === 'travel') {
    return { days: 0 };
  }

  if (fillKind === 'holiday') {
    return { days: 0 };
  }

  if (fillKind === 'pto') {
    if (text) {
      return { days: 0.5, anomaly: 'conflicting-marking' };
    }
    return { days: 1 };
  }

  if (isHalfDayText) {
    return { days: 0.5 };
  }

  if (fillKind === 'unrecognized') {
    return { days: 0, anomaly: 'unrecognized-marking' };
  }

  if (text) {
    return { days: 0, anomaly: 'unrecognized-marking' };
  }

  return { days: 0 };
}

/** Case- and accent-insensitive key for matching "Firstname Lastname" strings. */
export function normalizePersonName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const MONTH_ABBREVIATIONS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Parses an English 3-letter month abbreviation (row 6 of the sheet) into 1-12. */
export function parseMonthAbbreviation(value: unknown): number | undefined {
  const text = toTrimmedText(value);
  if (!text) {
    return undefined;
  }

  return MONTH_ABBREVIATIONS[text.slice(0, 3).toLowerCase()];
}

const MIN_PLAUSIBLE_YEAR = 1990;
const MAX_PLAUSIBLE_YEAR = 2100;

/** Parses a plausible 4-digit calendar year (row 2 of the sheet). */
export function parsePlausibleYear(value: unknown): number | undefined {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (
    !Number.isFinite(numericValue) ||
    !Number.isInteger(numericValue) ||
    numericValue < MIN_PLAUSIBLE_YEAR ||
    numericValue > MAX_PLAUSIBLE_YEAR
  ) {
    return undefined;
  }

  return numericValue;
}
