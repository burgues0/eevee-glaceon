import { WorkerResourceNode } from '@eevee/execution-contracts';

export interface WorkerResponse {
  passes: number;
  failures: number;
  completeTrace: string;
  resources?: WorkerResourceNode[];
}

export interface WorkerTestFile {
  templateId: number;
  type: import('./enum/worker-type.enum').WorkerType | 'legacy';
  content: string;
}
