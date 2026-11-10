export enum AttemptStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  // Grafia vinda da API (AttemptStatus.ENQUEUED no platform-api).
  Enqueued = "enqueded",
  Failed = "failed",
}

export const PROCESSING_ATTEMPT_STATUSES: ReadonlySet<string> = new Set([
  AttemptStatus.Pending,
  AttemptStatus.Enqueued,
  AttemptStatus.Running,
]);

import { WorkerResourceNode } from "./worker-resource";

export interface AssignmentAttempt {
  id: number;
  attempt: number;
  userId: number;
  assignmentId: number;
  isAcceptable: boolean;
  score: number;
  passes: number;
  fails: number;
  report: string;
  refinedReport?: string;
  resources?: WorkerResourceNode[];
  status: string;
  createdAt?: string;
}
