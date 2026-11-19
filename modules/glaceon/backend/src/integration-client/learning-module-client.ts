// STUB — replaces @cocsi-mg/eevee-learning-module-contracts.
//
// The real package lives in GitHub Packages (COCSI-MG org) per the advisor;
// this process has no read:packages credential configured, so this file
// reproduces the exact client shape the guide documents
// (docs/guia-migracao-modulos-internos-sql-arquitetura.md, "Biblioteca de
// integração") against the Integration API built in platform-api's
// learning-module module. Swapping this file for the real package later is
// mechanical: same function name, same method names, same call shape.

export interface LearningModuleClientConfig {
  endpoint: string;
  moduleId: string;
  credential: string;
  allowInsecureHttpForCluster?: boolean;
}

export interface LearningModuleCatalogEntryV1 {
  externalActivityId: string;
  revision: number;
  status: 'draft' | 'published' | 'retired';
  kind: 'practice' | 'quiz';
  title: string;
  effectiveAt: string;
}

export interface LearningModuleActivityContextV1 {
  externalActivityId: string;
  title: string;
  description: string;
  startDate: string | null;
  dueDate: string | null;
  maxAttempts: number;
  config: {
    variant: string;
    boilerplateContent: string;
    testFiles: Array<{ content: string }>;
  };
}

export interface SubmitPracticeAttemptPayload {
  kind: 'practice';
  score: number;
  passes: number;
  fails: number;
  report: string;
  resources?: unknown[];
}

export interface SubmitAttemptResultV1 {
  attemptId: number;
  attempt: number;
  score: number;
  isAcceptable: boolean;
}

// Carries the Integration API's own HTTP status (404 for unknown/retired/
// cross-class, 403 for role checks, 401 for bad credentials, 400 for a
// malformed Idempotency-Key) so callers can surface the same denial to the
// module's own frontend instead of a generic 500 — see
// LearningModuleClientExceptionFilter, the one place this gets translated.
export class LearningModuleClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface LearningModuleClient {
  listCatalog(userAssertion: string): Promise<LearningModuleCatalogEntryV1[]>;
  getContext(
    externalActivityId: string,
    userAssertion: string,
  ): Promise<LearningModuleActivityContextV1>;
  submitAttempt(
    externalActivityId: string,
    userAssertion: string,
    payload: SubmitPracticeAttemptPayload,
    idempotencyKey: string,
  ): Promise<SubmitAttemptResultV1>;
}

export function createLearningModuleClient(
  config: LearningModuleClientConfig,
): LearningModuleClient {
  if (
    !config.endpoint.startsWith('https://') &&
    !config.allowInsecureHttpForCluster
  ) {
    throw new Error(
      'Refusing a non-HTTPS Integration API endpoint without allowInsecureHttpForCluster.',
    );
  }

  const baseHeaders = (userAssertion: string) => ({
    'X-EEVEE-Module-Credential': config.credential,
    'X-EEVEE-Module-Assertion': userAssertion,
    'X-EEVEE-Learning-Module': config.moduleId,
    'Content-Type': 'application/json',
  });

  async function request<T>(
    path: string,
    userAssertion: string,
    init?: { method?: string; body?: unknown; idempotencyKey?: string },
  ): Promise<T> {
    const response = await fetch(`${config.endpoint}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        ...baseHeaders(userAssertion),
        ...(init?.idempotencyKey
          ? { 'Idempotency-Key': init.idempotencyKey }
          : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new LearningModuleClientError(
        response.status,
        (body && typeof body === 'object' && 'message' in body && String(body.message)) ||
          `Integration API ${init?.method ?? 'GET'} ${path} failed: ${response.status}`,
      );
    }

    return response.json() as Promise<T>;
  }

  return {
    listCatalog: (userAssertion) => request('/catalog', userAssertion),
    getContext: (externalActivityId, userAssertion) =>
      request(`/activities/${externalActivityId}/context`, userAssertion),
    submitAttempt: (externalActivityId, userAssertion, payload, idempotencyKey) =>
      request(`/activities/${externalActivityId}/attempts`, userAssertion, {
        method: 'POST',
        body: payload,
        idempotencyKey,
      }),
  };
}
