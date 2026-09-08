export const IMPORT_MONTH_COLUMN_START_INDEX = 8;
export const IMPORT_MONTH_COLUMN_COUNT = 12;

export const MONTH_ABBREVIATIONS = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
} as const;

export const IMPORT_WIZARD_STEPS = [
  { id: 'file-selection', title: 'File selection' },
  { id: 'technical-analysis', title: 'Technical analysis' },
  { id: 'preview', title: 'Preview' },
  { id: 'column-mapping', title: 'Column/type mapping' },
  { id: 'row-classification', title: 'Row classification' },
  { id: 'anomaly-review', title: 'Anomaly review' },
  { id: 'comparison', title: 'Comparison with previous import' },
  { id: 'validation', title: 'Validation' },
  { id: 'atomic-import', title: 'Atomic import' },
  { id: 'final-report', title: 'Final report' },
] as const;

export type ImportWizardStepId = (typeof IMPORT_WIZARD_STEPS)[number]['id'];
