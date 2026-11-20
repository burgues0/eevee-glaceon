import { ConfigService } from '@nestjs/config';

// Single module for now (terraform-ansible-practice, the GLACEON project's
// module id — same convention as the guide's sql-practice/architecture-forms:
// descriptive id, not the TCC's own name) — YAGNI: no admin UI, no
// multi-module registry. Add an entry here when a second module (e.g.
// sql-practice) is actually built, not before.
export const SUPPORTED_LEARNING_MODULE_IDS = ['terraform-ansible-practice'] as const;
export type LearningModuleId = (typeof SUPPORTED_LEARNING_MODULE_IDS)[number];

export function isSupportedLearningModuleId(id: string): id is LearningModuleId {
  return (SUPPORTED_LEARNING_MODULE_IDS as readonly string[]).includes(id);
}

const DEFAULT_MODULE_SESSION_TTL_SECONDS = 5 * 60;

export function getModuleSessionTtlSeconds(configService: ConfigService): number {
  return (
    Number(configService.get<string>('LEARNING_MODULE_SESSION_TTL_SECONDS')) ||
    DEFAULT_MODULE_SESSION_TTL_SECONDS
  );
}

export function getModuleJwtSecret(configService: ConfigService): string {
  return (
    configService.get<string>('LEARNING_MODULE_JWT_SECRET') ||
    configService.get<string>('JWT_SECRET') ||
    ''
  );
}

export function getModuleCredential(
  configService: ConfigService,
  moduleId: LearningModuleId,
): string | undefined {
  // Env var names can't contain hyphens — module ids can (e.g.
  // terraform-ansible-practice), so sanitize before building the lookup key.
  const envSuffix = moduleId.toUpperCase().replace(/-/g, '_');
  return configService.get<string>(`LEARNING_MODULE_CREDENTIAL_${envSuffix}`);
}

export function getModuleSessionCookieName(moduleId: LearningModuleId): string {
  return `eevee_module_${moduleId}`;
}

export function getModuleAudience(moduleId: LearningModuleId): string {
  return `module:${moduleId}`;
}
