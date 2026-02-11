import { ProcessedData, WorkerResponse } from '../types';

export const parseExcelFile = (file: File): Promise<{ data: ProcessedData, hash: string }> => {
  return new Promise((resolve, reject) => {
    // Use new URL syntax which is standard and Vite-compatible for Worker instantiation
    const worker = new Worker(new URL('../workers/dataProcessor.ts', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { type, data, hash, error } = e.data;
      if (type === 'SUCCESS' && data && hash) {
        // Hydrate dates back from JSON serialization (Worker transfer makes dates strings)
        data.records.forEach(r => {
          r.date = new Date(r.date);
        });
        resolve({ data, hash });
      } else {
        reject(new Error(error || 'Unknown error parsing file'));
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };

    worker.postMessage({ type: 'PARSE', file });
  });
};