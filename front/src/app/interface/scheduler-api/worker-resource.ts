export type WorkerResourceStatus = "ok" | "error" | "pending";

export interface WorkerResourceAttribute {
  key: string;
  value: string;
}

export interface WorkerResourceNode {
  id: string;
  label: string;
  kind: "group" | "resource" | "task";
  status?: WorkerResourceStatus;
  type?: string;
  attributes?: WorkerResourceAttribute[];
  relatedResources?: WorkerResourceAttribute[];
  logs?: string;
  children?: WorkerResourceNode[];
}
