import ResourceImportWorker from '@/workers/resourceImport.worker?worker';

import type { AnalyzeResourceImportRequest, ResourceImportAnalysis } from './types';

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

export interface ResourceImportWorkerClient {
  analyzeFile(request: AnalyzeResourceImportRequest): Promise<ResourceImportAnalysis>;
  dispose(): void;
}

export function createResourceImportWorkerClient(): ResourceImportWorkerClient {
  const worker = new ResourceImportWorker({ name: 'resource-import-worker' });
  const pendingRequests = new Map<
    string,
    {
      resolve: (analysis: ResourceImportAnalysis) => void;
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
      pending.reject(new Error(event.message || 'Resource import worker failed.'));
    }
    pendingRequests.clear();
  };

  return {
    analyzeFile(request) {
      return new Promise<ResourceImportAnalysis>((resolve, reject) => {
        const id = crypto.randomUUID();
        pendingRequests.set(id, { resolve, reject });

        const message: WorkerRequestMessage = {
          id,
          type: 'analyze-resource-import',
          payload: request,
        };

        worker.postMessage(message, [request.fileBuffer]);
      });
    },
    dispose() {
      for (const pending of pendingRequests.values()) {
        pending.reject(new Error('Resource import worker disposed.'));
      }
      pendingRequests.clear();
      worker.terminate();
    },
  };
}
