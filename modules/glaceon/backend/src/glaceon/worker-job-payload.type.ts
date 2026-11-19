// Ported from assignment-runner/src/worker/worker-job-payload.type.ts — the
// exact JSON shape the eevee-worker-bootstrap init container (reused as-is)
// decodes from WORKER_DEFINITION_B64_ENV_NAME.
export type WorkerJobPayload = {
  files: Record<string, string> | null;
  testFiles: Record<string, string> | null;
  srcPath: string;
  testPath: string;
  dependencies: string[];
};
