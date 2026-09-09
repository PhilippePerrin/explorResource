export const RESOURCE_IMPORT_WIZARD_STEPS = [
  { id: 'file-selection', title: 'File selection' },
  { id: 'preview', title: 'Preview' },
  { id: 'anomaly-review', title: 'Anomaly review' },
  { id: 'commit', title: 'Commit' },
  { id: 'final-report', title: 'Final report' },
] as const;

export type ResourceImportWizardStepId = (typeof RESOURCE_IMPORT_WIZARD_STEPS)[number]['id'];
