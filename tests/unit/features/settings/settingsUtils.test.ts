import { describe, expect, it } from 'vitest';

import {
  applySettingsFormValues,
  createDefaultAppSettings,
  createSettingsFormValues,
  settingsFormSchema,
} from '@/features/settings';

describe('settingsUtils', () => {
  it('maps the four editable threshold fields to the persisted AppSettings structure', () => {
    const updated = applySettingsFormValues(createDefaultAppSettings(), {
      availableBelow: 75,
      usedTo: 95,
      overloadTo: 108,
      criticalAbove: 125,
    });

    expect(updated.visualThresholds).toEqual({
      availableBelow: 75,
      usedFrom: 75,
      usedTo: 95,
      overloadFrom: 95,
      overloadTo: 108,
      criticalAbove: 125,
    });
  });

  it('rejects descending threshold boundaries', () => {
    const result = settingsFormSchema.safeParse({
      availableBelow: 90,
      usedTo: 80,
      overloadTo: 110,
      criticalAbove: 120,
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error('Expected the settings form schema to reject descending thresholds.');
    }

    expect(result.error.issues[0]?.message).toMatch(/greater than or equal to available below/i);
  });

  it('extracts editable form values from stored thresholds', () => {
    const values = createSettingsFormValues({
      availableBelow: 70,
      usedFrom: 70,
      usedTo: 92,
      overloadFrom: 92,
      overloadTo: 115,
      criticalAbove: 130,
    });

    expect(values).toEqual({
      availableBelow: 70,
      usedTo: 92,
      overloadTo: 115,
      criticalAbove: 130,
    });
  });
});
