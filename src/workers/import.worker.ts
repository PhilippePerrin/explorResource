import { analyzeImportWorkbook } from '@/import/parse';
import type { AnalyzeImportRequest, ImportAnalysis } from '@/import/types';

interface WorkerRequestMessage {
  id: string;
  type: 'analyze-import';
  payload: AnalyzeImportRequest;
}

interface WorkerSuccessMessage {
  id: string;
  type: 'analysis-result';
  payload: ImportAnalysis;
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
  if (event.data.type !== 'analyze-import') {
    return;
  }

  try {
    const payload = await analyzeImportWorkbook(event.data.payload);
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
        message: error instanceof Error ? error.message : 'Unknown import worker error.',
      },
    };
    self.postMessage(response);
  }
};
