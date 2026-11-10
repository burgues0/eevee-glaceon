import { WorkerResourceAttribute, WorkerResourceNode } from '@eevee/execution-contracts';
import { WorkerResponse } from '../worker.interfaces';
import { parseJestLogResult } from './worker-log-parsers';

const RESOURCES_JSON_START_MARKER = 'EEVEE_RESOURCES_JSON_START';
const RESOURCES_JSON_END_MARKER = 'EEVEE_RESOURCES_JSON_END';

interface RawResourceFact {
  id: string;
  category: string;
  type: string;
  status: 'ok' | 'error' | 'pending';
  attributes?: WorkerResourceAttribute[];
  relatedResources?: WorkerResourceAttribute[];
  logs?: string | null;
}

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

/**
 * Groups the flat resource/task facts each trigger.sh emits into the
 * category tree the "Recursos" tab renders. Terraform and Ansible produce
 * the same flat shape (see images/*-default/trigger.sh), so this is the one
 * place that knows how to turn it into a tree.
 */
export function buildResourceTree(
  facts: RawResourceFact[],
  leafKind: 'resource' | 'task',
): WorkerResourceNode[] {
  const byCategory = new Map<string, WorkerResourceNode[]>();

  for (const fact of facts) {
    const label =
      fact.attributes?.find((attribute) => attribute.key === 'nome')?.value ??
      fact.id;

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
    kind: 'group',
    status: groupStatus(children),
    children,
  }));
}

export function parseTerraformLogResult(log: string): WorkerResponse {
  const base = parseJestLogResult(log);
  return { ...base, resources: buildResourceTree(extractResourceFacts(log), 'resource') };
}

export function parseAnsibleLogResult(log: string): WorkerResponse {
  const base = parseJestLogResult(log);
  return { ...base, resources: buildResourceTree(extractResourceFacts(log), 'task') };
}
