import { WorkerResourceNode } from "./worker-resource";

export type SchedulingFiles = Record<string, string>;
export type SchedulingPreviewRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface Scheduling {
  assignmentId: number;
  applicationFileContent: string | undefined;
  files: SchedulingFiles;
}

export interface SchedulingResponse {
  assignmentId: number;
  isAcceptable: boolean;
  score: number;
  passes: number;
  fails: number;
  report: string;
  resources?: WorkerResourceNode[];
}

export interface SchedulingPreviewRun {
  id: number;
  assignmentId: number;
  status: SchedulingPreviewRunStatus;
  isAcceptable?: boolean;
  score?: number;
  passes?: number;
  fails?: number;
  report?: string;
  resources?: WorkerResourceNode[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
