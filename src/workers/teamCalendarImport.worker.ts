import { analyzeTeamCalendarWorkbook } from '@/teamCalendarImport/parse';
import type {
  AnalyzeTeamCalendarImportRequest,
  TeamCalendarAnalysis,
} from '@/teamCalendarImport/types';

interface WorkerRequestMessage {
  id: string;
  type: 'analyze-team-calendar-import';
  payload: AnalyzeTeamCalendarImportRequest;
}

interface WorkerSuccessMessage {
  id: string;
  type: 'analysis-result';
  payload: TeamCalendarAnalysis;
}

interface WorkerFailureMessage {
  id: string;
  type: 'analysis-error';
  payload: {
    message: string;
  };
}

type WorkerResponseMessage = WorkerSuccessMessage | WorkerFailureMessage;

self.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  if (event.data.type !== 'analyze-team-calendar-import') {
    return;
  }

  try {
    const payload = await analyzeTeamCalendarWorkbook(event.data.payload);
    const response: WorkerResponseMessage = {
      id: event.data.id,
      type: 'analysis-result',
      payload,
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponseMessage = {
      id: event.data.id,
      type: 'analysis-error',
      payload: {
        message: error instanceof Error ? error.message : 'Unknown team calendar worker error.',
      },
    };
    self.postMessage(response);
  }
};
