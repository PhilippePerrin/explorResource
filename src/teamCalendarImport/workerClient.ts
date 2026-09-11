import TeamCalendarImportWorker from '@/workers/teamCalendarImport.worker?worker';

import type { AnalyzeTeamCalendarImportRequest, TeamCalendarAnalysis } from './types';

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

export interface TeamCalendarImportWorkerClient {
  analyzeFile(request: AnalyzeTeamCalendarImportRequest): Promise<TeamCalendarAnalysis>;
  dispose(): void;
}

export function createTeamCalendarImportWorkerClient(): TeamCalendarImportWorkerClient {
  const worker = new TeamCalendarImportWorker({ name: 'team-calendar-import-worker' });
  const pendingRequests = new Map<
    string,
    {
      resolve: (analysis: TeamCalendarAnalysis) => void;
      reject: (error: Error) => void;
    }
  >();

  worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
    const pending = pendingRequests.get(event.data.id);

    if (!pending) {
      return;
    }

    pendingRequests.delete(event.data.id);

    if (event.data.type === 'analysis-result') {
      pending.resolve(event.data.payload);
      return;
    }

    pending.reject(new Error(event.data.payload.message));
  };

  worker.onerror = (event) => {
    for (const pending of pendingRequests.values()) {
      pending.reject(new Error(event.message || 'Team calendar import worker failed.'));
    }
    pendingRequests.clear();
  };

  return {
    analyzeFile(request) {
      return new Promise<TeamCalendarAnalysis>((resolve, reject) => {
        const id = crypto.randomUUID();
        pendingRequests.set(id, { resolve, reject });

        const message: WorkerRequestMessage = {
          id,
          type: 'analyze-team-calendar-import',
          payload: request,
        };

        worker.postMessage(message, [request.fileBuffer]);
      });
    },
    dispose() {
      for (const pending of pendingRequests.values()) {
        pending.reject(new Error('Team calendar import worker disposed.'));
      }
      pendingRequests.clear();
      worker.terminate();
    },
  };
}
