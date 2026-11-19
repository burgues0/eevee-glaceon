import { Injectable, Logger } from '@nestjs/common';
import { Client1_13, config } from 'kubernetes-client';
import {
  DEFAULT_NAMESPACE,
  JOB_IMAGE_PULL_POLICY,
  K8S_JOB_STATUS,
} from './kubernetes.constants';
import { KubernetesJobOptions, KubernetesJobResult } from './kubernetes.interfaces';

// Trimmed port of assignment-runner's KubernetesService
// (assignment-runner/src/kubernetes/kubernetes.service.ts) — this module
// backend only ever runs one shape of job (1 bootstrap init container +
// 1 shared emptyDir + a command override), so everything else that service
// supports (configMaps, secret volumes, seedSql, node-affinity diagnostics)
// is left out rather than copied unused.
@Injectable()
export class KubernetesService {
  private readonly logger = new Logger(KubernetesService.name);
  private readonly client = new Client1_13({
    config:
      process.env.KUBERNETES_SERVICE_HOST && process.env.KUBERNETES_SERVICE_PORT
        ? config.getInCluster()
        : config.fromKubeconfig(),
    version: '1.13',
  });

  async checkIfJobExists(jobName: string): Promise<boolean> {
    try {
      await this.client.apis.batch.v1.namespaces(DEFAULT_NAMESPACE).jobs(jobName).get();
      return true;
    } catch {
      return false;
    }
  }

  async deleteJobAndPods(jobName: string): Promise<void> {
    await Promise.allSettled([
      this.client.apis.batch.v1
        .namespaces(DEFAULT_NAMESPACE)
        .jobs(jobName)
        .delete({ qs: { propagationPolicy: 'Foreground' } }),
      this.getJobPods(jobName).then((pods) =>
        Promise.all(
          pods.map((pod: any) =>
            this.client.api.v1.namespaces(DEFAULT_NAMESPACE).pods(pod.metadata.name).delete(),
          ),
        ),
      ),
    ]);
  }

  private async getJob(jobName: string) {
    try {
      return await this.client.apis.batch.v1.namespaces(DEFAULT_NAMESPACE).jobs(jobName).get();
    } catch (err) {
      this.logger.error(`Error getting job ${jobName}: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async getJobPods(jobName: string) {
    const pods = await this.client.api.v1.namespaces(DEFAULT_NAMESPACE).pods.get({
      qs: { labelSelector: `job-name=${jobName}` },
    });
    return pods.body.items;
  }

  private unescapeAnsi(text: string): string {
    return (text || '').replace(/\x1b\[.*?m/g, '');
  }

  private async getJobLogsWithRetry(podName: string, containerName: string): Promise<string> {
    const maxRetries = 15;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const logs = await this.client.api.v1
          .namespaces(DEFAULT_NAMESPACE)
          .pods(podName)
          .log.get({ qs: { pretty: 'true', container: containerName } });
        return this.unescapeAnsi(logs.body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stillInitializing =
          message.includes('PodInitializing') ||
          message.includes('ContainerCreating') ||
          message.includes('waiting to start');
        if (!stillInitializing || attempt === maxRetries - 1) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`Unable to fetch logs for pod ${podName}`);
  }

  async createAndWaitForJobCompletion(
    jobName: string,
    imageName: string,
    command: string[],
    options: KubernetesJobOptions,
  ): Promise<KubernetesJobResult> {
    if (await this.checkIfJobExists(jobName)) {
      await this.deleteJobAndPods(jobName);
    }

    const jobManifest = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: jobName },
      spec: {
        activeDeadlineSeconds: options.activeDeadlineSeconds ?? 210,
        ttlSecondsAfterFinished: options.ttlSecondsAfterFinished ?? 900,
        backoffLimit: 0,
        template: {
          spec: {
            initContainers: options.initContainers.map((container) => ({
              name: container.name,
              image: container.image,
              imagePullPolicy: JOB_IMAGE_PULL_POLICY,
              env: container.env,
              volumeMounts: options.sharedEmptyDir.mounts.map((mount) => ({
                name: options.sharedEmptyDir.volumeName,
                ...mount,
              })),
            })),
            automountServiceAccountToken: false,
            containers: [
              {
                name: jobName,
                image: imageName,
                imagePullPolicy: JOB_IMAGE_PULL_POLICY,
                command,
                volumeMounts: options.sharedEmptyDir.mounts.map((mount) => ({
                  name: options.sharedEmptyDir.volumeName,
                  ...mount,
                })),
              },
            ],
            volumes: [{ name: options.sharedEmptyDir.volumeName, emptyDir: {} }],
            restartPolicy: 'Never',
          },
        },
      },
    };

    await this.client.apis.batch.v1.namespaces(DEFAULT_NAMESPACE).jobs.post({ body: jobManifest });

    let jobStatus: any;
    let iterations = 0;
    const maxIterations = 100;
    do {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const response = await this.getJob(jobName);
      if (!response?.body?.status) {
        throw new Error(`Job ${jobName} not found while waiting for completion.`);
      }
      jobStatus = response.body.status;
    } while (!jobStatus.succeeded && !jobStatus.failed && ++iterations < maxIterations);

    if (!jobStatus.succeeded && !jobStatus.failed) {
      await this.deleteJobAndPods(jobName);
      throw new Error(`Job ${jobName} did not finish within ${maxIterations * 2000}ms.`);
    }

    const status = jobStatus.succeeded ? K8S_JOB_STATUS.SUCCEEDED : K8S_JOB_STATUS.FAILED;
    const [pod] = await this.getJobPods(jobName);
    if (!pod?.metadata?.name) throw new Error(`No pod found for job ${jobName}.`);

    const message = await this.getJobLogsWithRetry(pod.metadata.name, jobName);
    return { name: jobName, status, message };
  }
}
