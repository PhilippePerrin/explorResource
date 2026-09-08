import { IMPORT_WIZARD_STEPS, type ImportWizardStepId } from './constants';
import type { ImportComparisonSummary, ImportAnalysis, ImportCommitResult } from './types';

export interface ImportWizardState {
  currentStepId: ImportWizardStepId;
  furthestStepIndex: number;
  selectedFile:
    | {
        fileName: string;
        fileSize: number;
      }
    | undefined;
  note: string;
  analysis: ImportAnalysis | null;
  comparison: ImportComparisonSummary | null;
  commitResult: ImportCommitResult | null;
  reportMarkdown: string | null;
  status: 'idle' | 'analyzing' | 'analysis-ready' | 'committing' | 'completed' | 'error';
  errorMessage: string | null;
}

export type ImportWizardAction =
  | { type: 'select-file'; fileName: string; fileSize: number }
  | { type: 'set-note'; note: string }
  | { type: 'analysis-started' }
  | { type: 'analysis-succeeded'; analysis: ImportAnalysis; comparison: ImportComparisonSummary }
  | { type: 'analysis-failed'; message: string }
  | { type: 'go-next' }
  | { type: 'go-back' }
  | { type: 'go-to-step'; stepId: ImportWizardStepId }
  | { type: 'commit-started' }
  | {
      type: 'commit-succeeded';
      commitResult: ImportCommitResult;
      reportMarkdown: string;
    }
  | { type: 'commit-failed'; message: string }
  | { type: 'reset' };

const INITIAL_STEP_ID: ImportWizardStepId = 'file-selection';

export const initialImportWizardState: ImportWizardState = {
  currentStepId: INITIAL_STEP_ID,
  furthestStepIndex: 0,
  selectedFile: undefined,
  note: '',
  analysis: null,
  comparison: null,
  commitResult: null,
  reportMarkdown: null,
  status: 'idle',
  errorMessage: null,
};

function getStepIndex(stepId: ImportWizardStepId): number {
  return IMPORT_WIZARD_STEPS.findIndex((step) => step.id === stepId);
}

function clampStepIndex(index: number): number {
  return Math.max(0, Math.min(index, IMPORT_WIZARD_STEPS.length - 1));
}

function withStep(state: ImportWizardState, stepIndex: number): ImportWizardState {
  const clampedStepIndex = clampStepIndex(stepIndex);
  const nextStep = IMPORT_WIZARD_STEPS[clampedStepIndex];

  if (!nextStep) {
    return state;
  }

  return {
    ...state,
    currentStepId: nextStep.id,
    furthestStepIndex: Math.max(state.furthestStepIndex, clampedStepIndex),
  };
}

export function importWizardReducer(
  state: ImportWizardState,
  action: ImportWizardAction,
): ImportWizardState {
  switch (action.type) {
    case 'select-file':
      return {
        ...initialImportWizardState,
        selectedFile: {
          fileName: action.fileName,
          fileSize: action.fileSize,
        },
      };

    case 'set-note':
      return {
        ...state,
        note: action.note,
      };

    case 'analysis-started':
      return {
        ...state,
        status: 'analyzing',
        errorMessage: null,
      };

    case 'analysis-succeeded':
      return {
        ...withStep(state, getStepIndex('preview')),
        analysis: action.analysis,
        comparison: action.comparison,
        status: 'analysis-ready',
        errorMessage: null,
      };

    case 'analysis-failed':
      return {
        ...state,
        status: 'error',
        errorMessage: action.message,
      };

    case 'go-next':
      return withStep(state, getStepIndex(state.currentStepId) + 1);

    case 'go-back':
      return withStep(state, getStepIndex(state.currentStepId) - 1);

    case 'go-to-step': {
      const stepIndex = getStepIndex(action.stepId);
      if (stepIndex > state.furthestStepIndex) {
        return state;
      }

      return withStep(state, stepIndex);
    }

    case 'commit-started':
      return {
        ...state,
        status: 'committing',
        errorMessage: null,
        currentStepId: 'atomic-import',
        furthestStepIndex: Math.max(state.furthestStepIndex, getStepIndex('atomic-import')),
      };

    case 'commit-succeeded':
      return {
        ...state,
        status: 'completed',
        commitResult: action.commitResult,
        reportMarkdown: action.reportMarkdown,
        currentStepId: 'final-report',
        furthestStepIndex: IMPORT_WIZARD_STEPS.length - 1,
      };

    case 'commit-failed':
      return {
        ...state,
        status: 'error',
        errorMessage: action.message,
        currentStepId: 'validation',
      };

    case 'reset':
      return initialImportWizardState;
  }
}

export function canMoveToNextStep(state: ImportWizardState): boolean {
  if (state.status === 'analyzing' || state.status === 'committing') {
    return false;
  }

  if (!state.analysis) {
    return state.currentStepId === 'file-selection';
  }

  if (state.currentStepId === 'validation') {
    return false;
  }

  return getStepIndex(state.currentStepId) < getStepIndex('validation');
}

export function hasBlockingAnomalies(state: ImportWizardState): boolean {
  return state.analysis?.anomalies.some((anomaly) => anomaly.severity === 'blocking') ?? false;
}
