export const DEFAULT_NAMESPACE: string =
  process.env.K8S_NAMESPACE?.trim() || 'default';

export const JOB_IMAGE_PULL_POLICY: string =
  process.env.K8S_JOB_IMAGE_PULL_POLICY?.trim() || 'Always';

export enum K8S_JOB_STATUS {
  SUCCEEDED = 'Succeeded',
  FAILED = 'Failed',
}
