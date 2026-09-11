import { describe, expect, it } from 'vitest';

import {
  classifyCalendarFill,
  decodeCalendarCell,
  normalizePersonName,
  parseMonthAbbreviation,
  parsePlausibleYear,
} from '@/teamCalendarImport/decode';

const PTO_STYLE = { patternType: 'solid', fgColor: { rgb: 'C00000' } };
const TRAVEL_STYLE = { patternType: 'solid', fgColor: { rgb: 'FFFF00' } };
const HOLIDAY_STYLE = { patternType: 'solid', fgColor: { theme: 0, tint: -0.4999984740745262 } };
const BASE_STYLE = { patternType: 'solid', fgColor: { rgb: 'DEEBF7' } };
const UNRECOGNIZED_STYLE = { patternType: 'solid', fgColor: { rgb: 'DAE3F3' } };

describe('classifyCalendarFill', () => {
  it('classifies the known legend fills', () => {
    expect(classifyCalendarFill(PTO_STYLE)).toBe('pto');
    expect(classifyCalendarFill(TRAVEL_STYLE)).toBe('travel');
    expect(classifyCalendarFill(HOLIDAY_STYLE)).toBe('holiday');
    expect(classifyCalendarFill(BASE_STYLE)).toBe('base');
  });

  it('classifies an undocumented solid fill as unrecognized', () => {
    expect(classifyCalendarFill(UNRECOGNIZED_STYLE)).toBe('unrecognized');
  });

  it('classifies no style / no pattern as none', () => {
    expect(classifyCalendarFill(undefined)).toBe('none');
    expect(classifyCalendarFill({ patternType: 'none' })).toBe('none');
  });
});

describe('decodeCalendarCell', () => {
  it('decodes PM/AM text with no fill as a half day', () => {
    expect(decodeCalendarCell({ value: 'PM', fillKind: 'base' })).toEqual({ days: 0.5 });
    expect(decodeCalendarCell({ value: 'AM', fillKind: 'none' })).toEqual({ days: 0.5 });
  });

  it('decodes an untouched cell as zero', () => {
    expect(decodeCalendarCell({ value: undefined, fillKind: 'none' })).toEqual({ days: 0 });
    expect(decodeCalendarCell({ value: undefined, fillKind: 'base' })).toEqual({ days: 0 });
  });

  it('decodes a PTO fill with no text as a full day', () => {
    expect(decodeCalendarCell({ value: undefined, fillKind: 'pto' })).toEqual({ days: 1 });
  });

  it('lets explicit text on a PTO fill win as a flagged half day', () => {
    expect(decodeCalendarCell({ value: 'AM', fillKind: 'pto' })).toEqual({
      days: 0.5,
      anomaly: 'conflicting-marking',
    });
    expect(decodeCalendarCell({ value: '.', fillKind: 'pto' })).toEqual({
      days: 0.5,
      anomaly: 'conflicting-marking',
    });
  });

  it('never counts Travelling as a non-working day, even with a location note', () => {
    expect(decodeCalendarCell({ value: undefined, fillKind: 'travel' })).toEqual({ days: 0 });
    expect(decodeCalendarCell({ value: 'PT', fillKind: 'travel' })).toEqual({ days: 0 });
  });

  it('never counts a company-wide holiday at the resource level', () => {
    expect(decodeCalendarCell({ value: undefined, fillKind: 'holiday' })).toEqual({ days: 0 });
  });

  it('excludes and flags an unrecognized solid fill with no text', () => {
    expect(decodeCalendarCell({ value: undefined, fillKind: 'unrecognized' })).toEqual({
      days: 0,
      anomaly: 'unrecognized-marking',
    });
  });

  it('excludes and flags unrecognized text on a non-semantic fill', () => {
    expect(decodeCalendarCell({ value: 'XYZ', fillKind: 'base' })).toEqual({
      days: 0,
      anomaly: 'unrecognized-marking',
    });
  });
});

describe('normalizePersonName', () => {
  it('is case-insensitive', () => {
    expect(normalizePersonName('Mehdi Khaddor')).toBe(normalizePersonName('MEHDI KHADDOR'));
  });

  it('is accent-insensitive', () => {
    expect(normalizePersonName('André ESTEVES')).toBe(normalizePersonName('andre esteves'));
  });

  it('collapses repeated whitespace', () => {
    expect(normalizePersonName('Salim   Slami')).toBe(normalizePersonName('Salim Slami'));
  });
});

describe('parseMonthAbbreviation / parsePlausibleYear', () => {
  it('parses English month abbreviations', () => {
    expect(parseMonthAbbreviation('Dec')).toBe(12);
    expect(parseMonthAbbreviation('jan')).toBe(1);
    expect(parseMonthAbbreviation('Nope')).toBeUndefined();
  });

  it('parses a plausible year and rejects everything else', () => {
    expect(parsePlausibleYear(2025)).toBe(2025);
    expect(parsePlausibleYear(50)).toBeUndefined();
    expect(parsePlausibleYear('not a year')).toBeUndefined();
  });
});
