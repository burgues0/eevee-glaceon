import { WorkerResourceNode } from "@/components/glaceon/worker-resource.types";

export interface CatalogEntry {
  externalActivityId: string;
  revision: number;
  status: "draft" | "published" | "retired";
  kind: "practice" | "quiz";
  title: string;
  effectiveAt: string;
}

export interface ActivityForStudent {
  externalActivityId: string;
  title: string;
  description: string;
  startDate: string | null;
  dueDate: string | null;
  maxAttempts: number;
  variant: string;
  boilerplateContent: string;
}

export interface RunResult {
  passes: number;
  fails: number;
  score: number;
  report: string;
  resources: WorkerResourceNode[];
}

export interface SubmitResult extends RunResult {
  attemptId: number;
  attempt: number;
  isAcceptable: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: "include" });
  if (!response.ok) {
    throw new Error(`GLACEON API ${init?.method ?? "GET"} ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const glaceonApi = {
  listCatalog: () => request<CatalogEntry[]>("/catalog"),
  getActivity: (externalActivityId: string) =>
    request<ActivityForStudent>(`/activities/${externalActivityId}`),
  run: (externalActivityId: string, content: string) =>
    request<RunResult>(`/activities/${externalActivityId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  submit: (externalActivityId: string, content: string) =>
    request<SubmitResult>(`/activities/${externalActivityId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
};
