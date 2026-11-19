export interface KubernetesJobResult {
  name: string;
  status: string;
  message: string;
}

export interface KubernetesJobOptions {
  sharedEmptyDir: {
    volumeName: string;
    mounts: { mountPath: string; subPath?: string }[];
  };
  initContainers: {
    name: string;
    image: string;
    env: { name: string; value: string }[];
  }[];
  activeDeadlineSeconds?: number;
  ttlSecondsAfterFinished?: number;
}
