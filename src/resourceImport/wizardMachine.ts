import { RESOURCE_IMPORT_WIZARD_STEPS, type ResourceImportWizardStepId } from './constants';
import type { ResourceImportAnalysis, ResourceImportCommitResult } from './types';

export interface ResourceImportWizardState {
  currentStepId: ResourceImportWizardStepId;
  furthestStepIndex: number;
  selectedFile:
    | {
        fileName: string;
        fileSize: number;
      }
    | undefined;
  note: string;
  analysis: ResourceImportAnalysis | null;
  commitResult: ResourceImportCommitResult | null;
  reportMarkdown: string | null;
  status: 'idle' | 'analyzing' | 'analysis-ready' | 'committing' | 'completed' | 'error';
  errorMessage: string | null;
}

export type ResourceImportWizardAction =
  | { type: 'select-file'; fileName: string; fileSize: number }
  | { type: 'set-note'; note: string }
  | { type: 'analysis-started' }
  | { type: 'analysis-succeeded'; analysis: ResourceImportAnalysis }
  | { type: 'analysis-failed'; message: string }
  | { type: 'go-next' }
  | { type: 'go-back' }
  | { type: 'go-to-step'; stepId: ResourceImportWizardStepId }
  | { type: 'commit-started' }
  | { type: 'commit-succeeded'; commitResult: ResourceImportCommitResult; reportMarkdown: string }
  | { type: 'commit-failed'; message: string }
  | { type: 'reset' };

const INITIAL_STEP_ID: ResourceImportWizardStepId = 'file-selection';

export const initialResourceImportWizardState: ResourceImportWizardState = {
  currentStepId: INITIAL_STEP_ID,
  furthestStepIndex: 0,
  selectedFile: undefined,
  note: '',
  analysis: null,
  commitResult: null,
  reportMarkdown: null,
  status: 'idle',
  errorMessage: null,
};

function getStepIndex(stepId: ResourceImportWizardStepId): number {
  return RESOURCE_IMPORT_WIZARD_STEPS.findIndex((step) => step.id === stepId);
}

function clampStepIndex(index: number): number {
  return Math.max(0, Math.min(index, RESOURCE_IMPORT_WIZARD_STEPS.length - 1));
}

function withStep(state: ResourceImportWizardState, stepIndex: number): ResourceImportWizardState {
  const clampedStepIndex = clampStepIndex(stepIndex);
  const nextStep = RESOURCE_IMPORT_WIZARD_STEPS[clampedStepIndex];

  if (!nextStep) {
    return state;
  }

  return {
    ...state,
    currentStepId: nextStep.id,
    furthestStepIndex: Math.max(state.furthestStepIndex, clampedStepIndex),
  };
}

export function resourceImportWizardReducer(
  state: ResourceImportWizardState,
  action: ResourceImportWizardAction,
): ResourceImportWizardState {
  switch (action.type) {
    case 'select-file':
      return {
        ...initialResourceImportWizardState,
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
        currentStepId: 'commit',
        furthestStepIndex: Math.max(state.furthestStepIndex, getStepIndex('commit')),
      };

    case 'commit-succeeded':
      return {
        ...state,
        status: 'completed',
        commitResult: action.commitResult,
        reportMarkdown: action.reportMarkdown,
        currentStepId: 'final-report',
        furthestStepIndex: RESOURCE_IMPORT_WIZARD_STEPS.length - 1,
      };

    case 'commit-failed':
      return {
        ...state,
        status: 'error',
        errorMessage: action.message,
        currentStepId: 'anomaly-review',
      };

    case 'reset':
      return initialResourceImportWizardState;
  }
}

export function canMoveToNextStep(state: ResourceImportWizardState): boolean {
  if (state.status === 'analyzing' || state.status === 'committing') {
    return false;
  }

  if (!state.analysis) {
    return state.currentStepId === 'file-selection';
  }

  if (state.currentStepId === 'anomaly-review') {
    return false;
  }

  return getStepIndex(state.currentStepId) < getStepIndex('anomaly-review');
}

export function hasBlockingAnomalies(state: ResourceImportWizardState): boolean {
  return state.analysis?.anomalies.some((anomaly) => anomaly.severity === 'blocking') ?? false;
}
