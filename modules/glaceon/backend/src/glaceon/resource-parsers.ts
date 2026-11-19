// Ported from assignment-runner/src/worker/strategies/worker-resource-parsers.ts
// and worker-log-parsers.ts (parseJestLogResult only — GLACEON never needed
// the pytest/cypress variants). Copied rather than imported: this module
// can't depend on assignment-runner's internals.

export interface WorkerResourceAttribute {
  key: string;
  value: string;
}

export interface WorkerResourceNode {
  id: string;
  label: string;
  kind: 'group' | 'resource' | 'task';
  status?: 'ok' | 'error' | 'pending';
  type?: string;
  attributes?: WorkerResourceAttribute[];
  relatedResources?: WorkerResourceAttribute[];
  logs?: string;
  children?: WorkerResourceNode[];
}

export interface ParsedWorkerResult {
  passes: number;
  failures: number;
  completeTrace: string;
  resources: WorkerResourceNode[];
}

interface RawResourceFact {
  id: string;
  category: string;
  type: string;
  status: 'ok' | 'error' | 'pending';
  attributes?: WorkerResourceAttribute[];
  relatedResources?: WorkerResourceAttribute[];
  logs?: string | null;
}

const RESOURCES_JSON_START_MARKER = 'EEVEE_RESOURCES_JSON_START';
const RESOURCES_JSON_END_MARKER = 'EEVEE_RESOURCES_JSON_END';

function extractResourceFacts(log: string): RawResourceFact[] {
  const startIndex = log.lastIndexOf(RESOURCES_JSON_START_MARKER);
  if (startIndex === -1) return [];
  const contentStart = startIndex + RESOURCES_JSON_START_MARKER.length;
  const endIndex = log.indexOf(RESOURCES_JSON_END_MARKER, contentStart);
  if (endIndex === -1) return [];
  const raw = log.slice(contentStart, endIndex).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function groupStatus(children: WorkerResourceNode[]): WorkerResourceNode['status'] {
  if (children.some((child) => child.status === 'error')) return 'error';
  if (children.some((child) => child.status === 'pending')) return 'pending';
  return 'ok';
}

function buildResourceTree(
  facts: RawResourceFact[],
  leafKind: 'resource' | 'task',
): WorkerResourceNode[] {
  const byCategory = new Map<string, WorkerResourceNode[]>();

  for (const fact of facts) {
    const label = fact.attributes?.find((a) => a.key === 'nome')?.value ?? fact.id;
    const leaf: WorkerResourceNode = {
      id: fact.id,
      label,
      kind: leafKind,
      status: fact.status,
      type: fact.type,
      attributes: fact.attributes ?? [],
      relatedResources: fact.relatedResources ?? [],
      logs: fact.logs ?? undefined,
    };
    const siblings = byCategory.get(fact.category) ?? [];
    siblings.push(leaf);
    byCategory.set(fact.category, siblings);
  }

  return Array.from(byCategory.entries()).map(([category, children]) => ({
    id: category,
    label: category,
    kind: 'group' as const,
    status: groupStatus(children),
    children,
  }));
}

function parseJestLogResult(log: string): { passes: number; failures: number; completeTrace: string } {
  const summaryLine = log.split('\n').find((line) => line.includes('Tests:'));
  let passes = 0;
  let total = 0;
  if (summaryLine) {
    passes = Number(summaryLine.match(/(\d+)\s+passed/)?.[1] ?? 0);
    total = Number(summaryLine.match(/(\d+)\s+total/)?.[1] ?? 0);
  }
  return { passes, failures: total - passes, completeTrace: log };
}

export function parseTerraformLogResult(log: string): ParsedWorkerResult {
  return { ...parseJestLogResult(log), resources: buildResourceTree(extractResourceFacts(log), 'resource') };
}

export function parseAnsibleLogResult(log: string): ParsedWorkerResult {
  return { ...parseJestLogResult(log), resources: buildResourceTree(extractResourceFacts(log), 'task') };
}
