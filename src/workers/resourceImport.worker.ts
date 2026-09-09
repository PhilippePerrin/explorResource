import { analyzeResourceImportWorkbook } from '@/resourceImport/parse';
import type { AnalyzeResourceImportRequest, ResourceImportAnalysis } from '@/resourceImport/types';

interface WorkerRequestMessage {
  id: string;
  type: 'analyze-resource-import';
  payload: AnalyzeResourceImportRequest;
}

interface WorkerSuccessMessage {
  id: string;
  type: 'analysis-result';
  payload: ResourceImportAnalysis;
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
  if (event.data.type !== 'analyze-resource-import') {
    return;
  }

  try {
    const payload = await analyzeResourceImportWorkbook(event.data.payload);
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
        message: error instanceof Error ? error.message : 'Unknown resource import worker error.',
      },
    };
    self.postMessage(response);
  }
};
