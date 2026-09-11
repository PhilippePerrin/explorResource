export const TEAM_CALENDAR_IMPORT_WIZARD_STEPS = [
  { id: 'file-selection', title: 'File selection' },
  { id: 'preview', title: 'Preview' },
  { id: 'anomaly-review', title: 'Anomaly review' },
  { id: 'commit', title: 'Commit' },
  { id: 'final-report', title: 'Final report' },
] as const;

export type TeamCalendarImportWizardStepId =
  (typeof TEAM_CALENDAR_IMPORT_WIZARD_STEPS)[number]['id'];
