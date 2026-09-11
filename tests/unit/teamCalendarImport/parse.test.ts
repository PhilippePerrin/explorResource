import { describe, expect, it } from 'vitest';

import { analyzeTeamCalendarWorkbook } from '@/teamCalendarImport/parse';

import { buildFixtureResources, readTeamCalendarFixtureBuffer } from './teamCalendarTestData';

describe('analyzeTeamCalendarWorkbook (real fixture)', () => {
  it('parses the real Team Calendar sheet and matches all 24 resources', async () => {
    const buffer = readTeamCalendarFixtureBuffer();
    const resources = buildFixtureResources();

    const analysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources,
      existingImportBatches: [],
    });

    expect(analysis.sheetName.trim().toLowerCase()).toBe('presence');
    expect(analysis.statistics.resourceRows).toBe(24);
    expect(analysis.statistics.matchedResourceRows).toBe(24);
    expect(analysis.statistics.unmatchedResourceRows).toBe(0);
    expect(analysis.anomalies.filter((a) => a.severity === 'blocking')).toHaveLength(0);

    console.log('monthlyTotals count:', analysis.monthlyTotals.length);
    console.log('stats:', JSON.stringify(analysis.statistics));
    console.log('anomaly codes:', [...new Set(analysis.anomalies.map((a) => a.code))]);
    console.log('warning count:', analysis.anomalies.filter((a) => a.severity === 'warning').length);
  });

  it('flags every resource as unknown when no resources are provided, without blocking the import', async () => {
    const buffer = readTeamCalendarFixtureBuffer();

    const analysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources: [],
      existingImportBatches: [],
    });

    expect(analysis.statistics.unmatchedResourceRows).toBe(24);
    const unknownResourceAnomalies = analysis.anomalies.filter(
      (a) => a.code === 'unknown-resource',
    );
    expect(unknownResourceAnomalies).toHaveLength(24);
    // Missing resources are reported, but must never block the rest of the import.
    expect(unknownResourceAnomalies.every((a) => a.severity === 'warning')).toBe(true);
    expect(analysis.anomalies.filter((a) => a.severity === 'blocking')).toHaveLength(0);
  });

  it('treats an archived (not active) resource as unmatched, with a non-blocking warning', async () => {
    const buffer = readTeamCalendarFixtureBuffer();
    const resources = buildFixtureResources();
    const david = resources.find((r) => r.lastName === 'CARRASCO');
    if (!david) {
      throw new Error('fixture resource missing');
    }
    david.status = 'archived';

    const analysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources,
      existingImportBatches: [],
    });

    expect(analysis.statistics.matchedResourceRows).toBe(23);
    expect(analysis.statistics.unmatchedResourceRows).toBe(1);
    expect(analysis.anomalies.filter((a) => a.severity === 'blocking')).toHaveLength(0);
    expect(
      analysis.anomalies.some(
        (a) => a.code === 'unknown-resource' && a.severity === 'warning',
      ),
    ).toBe(true);
    // The archived resource's rows are simply excluded from this import's staged totals.
    expect(analysis.monthlyTotals.some((total) => total.resourceId === david.id)).toBe(false);
    // Everyone else still resolves and stages normally.
    expect(analysis.monthlyTotals.length).toBeGreaterThan(0);
  });

  it('computes David CARRASCO August 2025 as a large PTO block', async () => {
    const buffer = readTeamCalendarFixtureBuffer();
    const resources = buildFixtureResources();

    const analysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources,
      existingImportBatches: [],
    });

    const david = resources.find((r) => r.lastName === 'CARRASCO');
    const total = analysis.monthlyTotals.find(
      (t) => t.resourceId === david?.id && t.year === 2025 && t.month === 8,
    );
    console.log('David CARRASCO Aug 2025 total:', total?.days);
    expect(total?.days ?? 0).toBeGreaterThan(10);
  });

  it('computes Nicolas FAURE half-day AM entries', async () => {
    const buffer = readTeamCalendarFixtureBuffer();
    const resources = buildFixtureResources();

    const analysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources,
      existingImportBatches: [],
    });

    const nicolas = resources.find((r) => r.lastName === 'FAURE');
    const feb2025 = analysis.monthlyTotals.find(
      (t) => t.resourceId === nicolas?.id && t.year === 2025 && t.month === 2,
    );
    const jul2025 = analysis.monthlyTotals.find(
      (t) => t.resourceId === nicolas?.id && t.year === 2025 && t.month === 7,
    );
    console.log('Nicolas FAURE Feb 2025:', feb2025?.days, 'Jul 2025:', jul2025?.days);
    expect(feb2025?.days).toBeGreaterThanOrEqual(0.5);
    expect(jul2025?.days).toBeGreaterThanOrEqual(0.5);
  });
});
