import { parseAnsibleLogResult, parseTerraformLogResult } from './resource-parsers';

// Images, bootstrap contract and entrypoint quirks are reused as-is from
// images/terraform-default and images/ansible-default — nothing about them
// changes just because the job is now triggered by this module backend
// instead of assignment-runner. See docs/glaceon.md for why.
function getImage(envName: string, fallback: string): string {
  return (process.env[envName]?.trim() || fallback).split('@')[0];
}

export const WORKER_BOOTSTRAP_IMAGE_NAME = getImage(
  'WORKER_BOOTSTRAP_IMAGE',
  'docker.io/library/eevee-worker-bootstrap:latest',
);
export const WORKER_DEFINITION_B64_ENV_NAME = 'WORKER_DEFINITION_B64';

export const SRC_PATH = '/app/src';
export const TEST_PATH = '/app/test';

export interface GlaceonVariantConfig {
  imageName: string;
  jobPrefix: string;
  studentFileName: string;
  executionCommand: string[];
  processLogResult: typeof parseTerraformLogResult;
}

export const GLACEON_VARIANTS: Record<string, GlaceonVariantConfig> = {
  terraform: {
    imageName: getImage('WORKER_IMAGE_TERRAFORM', 'docker.io/library/worker-terraform-default-img:latest'),
    jobPrefix: 'glaceon-worker-terraform',
    studentFileName: 'main.tf',
    // Kubernetes `command` overrides ENTRYPOINT (unlike `args`), so the
    // Floci-starting entrypoint has to be invoked explicitly — same bug/fix
    // as assignment-runner's TerraformDefaultStrategy.
    executionCommand: ['/usr/local/bin/eevee-terraform-entrypoint', '/app/trigger.sh'],
    processLogResult: parseTerraformLogResult,
  },
  ansible: {
    imageName: getImage('WORKER_IMAGE_ANSIBLE', 'docker.io/library/worker-ansible-default-img:latest'),
    jobPrefix: 'glaceon-worker-ansible',
    studentFileName: 'playbook.yml',
    executionCommand: ['/app/trigger.sh'],
    processLogResult: parseAnsibleLogResult,
  },
};

export function getVariantConfig(variant: string): GlaceonVariantConfig {
  const config = GLACEON_VARIANTS[variant];
  if (!config) throw new Error(`Unsupported GLACEON variant: ${variant}`);
  return config;
}
