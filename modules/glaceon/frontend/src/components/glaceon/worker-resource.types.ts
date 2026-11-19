// Mirrors the resources/attributes shape the module backend's
// resource-parsers.ts produces — crosses the HTTP boundary as plain JSON, so
// no shared package is needed between the two services.
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
