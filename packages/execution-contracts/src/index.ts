export const EXECUTION_COMMAND_QUEUE = 'execution-commands';
export const EXECUTION_RESULTS_QUEUE = 'execution-results';
export const EXECUTION_REQUEST_QUEUE = 'execution-requests';

export type ExecutionLifecycleStatus = 'running' | 'completed' | 'failed';

export interface ExecutionWorkerPayload {
  executionMode?: 'graded' | 'adhoc';
  applicationFileContent?: string;
  files?: Record<string, string> | null;
  testFilesContent?: string[];
  testFiles?: Array<{
    templateId: number;
    type: string;
    content: string;
  }>;
  dependencies?: string[];
  initSqlScript?: string;
  templateVariablesModuleContent?: string;
}

export interface ExecutionCommand {
  target: ExecutionTarget;
  jobName: string;
  workerType: string;
  workerData: ExecutionWorkerPayload;
}

export interface ExecutionTarget {
  kind: 'attempt' | 'preview';
  id: number;
  userId: number;
}

export interface ExecutionRequest {
  action: 'execute';
  jobName: string;
  workerType: string;
  workerData: ExecutionWorkerPayload;
}

export interface ExecutionCancelRequest {
  action: 'cancel';
  jobName: string;
}

export type ExecutionRequestCommand = ExecutionRequest | ExecutionCancelRequest;

export type WorkerResourceStatus = 'ok' | 'error' | 'pending';

export interface WorkerResourceAttribute {
  key: string;
  value: string;
}

export interface WorkerResourceNode {
  id: string;
  label: string;
  kind: 'group' | 'resource' | 'task';
  status?: WorkerResourceStatus;
  type?: string;
  attributes?: WorkerResourceAttribute[];
  relatedResources?: WorkerResourceAttribute[];
  logs?: string;
  children?: WorkerResourceNode[];
}

export interface ExecutionWorkerResult {
  completeTrace: string;
  failures: number;
  passes: number;
  resources?: WorkerResourceNode[];
}

export type ExecutionEventName =
  | 'execution.started.v1'
  | 'execution.completed.v1'
  | 'execution.failed.v1';

export interface ExecutionResult {
  isAcceptable: boolean;
  score: number;
  report: string;
  fails: number;
  passes: number;
  resources?: WorkerResourceNode[];
}

export interface ExecutionEvent {
  eventId: string;
  name: ExecutionEventName;
  occurredAt: string;
  target: ExecutionTarget;
  status: ExecutionLifecycleStatus;
  result?: ExecutionResult;
  errorMessage?: string;
}
