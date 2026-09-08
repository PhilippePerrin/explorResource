import ImportWorker from '@/workers/import.worker?worker';

import type { AnalyzeImportRequest, ImportAnalysis } from './types';

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

export interface ImportWorkerClient {
  analyzeFile(request: AnalyzeImportRequest): Promise<ImportAnalysis>;
  dispose(): void;
}

export function createImportWorkerClient(): ImportWorkerClient {
  const worker = new ImportWorker({ name: 'import-worker' });
  const pendingRequests = new Map<
    string,
    {
      resolve: (analysis: ImportAnalysis) => void;
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
      pending.reject(new Error(event.message || 'Import worker failed.'));
    }
    pendingRequests.clear();
  };

  return {
    analyzeFile(request) {
      return new Promise<ImportAnalysis>((resolve, reject) => {
        const id = crypto.randomUUID();
        pendingRequests.set(id, { resolve, reject });

        const message: WorkerRequestMessage = {
          id,
          type: 'analyze-import',
          payload: request,
        };

        worker.postMessage(message, [request.fileBuffer]);
      });
    },
    dispose() {
      for (const pending of pendingRequests.values()) {
        pending.reject(new Error('Import worker disposed.'));
      }
      pendingRequests.clear();
      worker.terminate();
    },
  };
}
