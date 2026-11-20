import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createLearningModuleClient,
  LearningModuleActivityContextV1,
  LearningModuleCatalogEntryV1,
} from '../integration-client/learning-module-client';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import {
  SRC_PATH,
  TEST_PATH,
  WORKER_BOOTSTRAP_IMAGE_NAME,
  WORKER_DEFINITION_B64_ENV_NAME,
  getVariantConfig,
} from './glaceon.config';
import { WorkerJobPayload } from './worker-job-payload.type';
import { WorkerResourceNode } from './resource-parsers';

export interface RunResult {
  passes: number;
  fails: number;
  score: number;
  report: string;
  resources: WorkerResourceNode[];
}

export interface GlaceonActivityForStudent {
  externalActivityId: string;
  title: string;
  description: string;
  startDate: string | null;
  dueDate: string | null;
  maxAttempts: number;
  variant: string;
  boilerplateContent: string;
}

@Injectable()
export class GlaceonService {
  private readonly client = createLearningModuleClient({
    endpoint: this.getEndpoint(),
    // Contract-level module id (routes, X-EEVEE-Learning-Module, credential
    // env var) — distinct from "glaceon", which is just this project's own
    // name. Same convention the guide's sql-practice/architecture-forms use.
    moduleId: 'terraform-ansible-practice',
    credential: this.configService.get<string>('GLACEON_MODULE_CREDENTIAL') ?? '',
    allowInsecureHttpForCluster: this.configService.get<string>('ENV') !== 'production',
  });

  constructor(
    private readonly configService: ConfigService,
    private readonly kubernetesService: KubernetesService,
  ) {}

  private getEndpoint(): string {
    return (
      this.configService.get<string>('EEVEE_LEARNING_INTEGRATION_URL') ??
      'http://platform-api-service/v1/module-integration/v1'
    );
  }

  async listCatalog(userAssertion: string): Promise<LearningModuleCatalogEntryV1[]> {
    return this.client.listCatalog(userAssertion);
  }

  async getActivityForStudent(
    externalActivityId: string,
    userAssertion: string,
  ): Promise<GlaceonActivityForStudent> {
    const context = await this.client.getContext(externalActivityId, userAssertion);
    // testFiles (the validation script) is the gabarito — never forward it
    // to the browser, only use it server-side when actually running the job.
    return {
      externalActivityId: context.externalActivityId,
      title: context.title,
      description: context.description,
      startDate: context.startDate,
      dueDate: context.dueDate,
      maxAttempts: context.maxAttempts,
      variant: context.config.variant,
      boilerplateContent: context.config.boilerplateContent,
    };
  }

  async run(
    externalActivityId: string,
    userAssertion: string,
    studentContent: string,
  ): Promise<RunResult> {
    const context = await this.client.getContext(externalActivityId, userAssertion);
    const variantConfig = getVariantConfig(context.config.variant);

    const payload = await this.runJob(context, variantConfig, studentContent, externalActivityId);
    return payload;
  }

  async submit(
    externalActivityId: string,
    userAssertion: string,
    studentContent: string,
  ): Promise<RunResult & { attemptId: number; attempt: number; isAcceptable: boolean }> {
    const context = await this.client.getContext(externalActivityId, userAssertion);
    const variantConfig = getVariantConfig(context.config.variant);

    const runResult = await this.runJob(context, variantConfig, studentContent, externalActivityId);

    const submitResult = await this.client.submitAttempt(
      externalActivityId,
      userAssertion,
      {
        kind: 'practice',
        score: runResult.score,
        passes: runResult.passes,
        fails: runResult.fails,
        report: runResult.report,
        resources: runResult.resources,
      },
      randomUUID(),
    );

    return { ...runResult, ...submitResult };
  }

  private async runJob(
    context: LearningModuleActivityContextV1,
    variantConfig: ReturnType<typeof getVariantConfig>,
    studentContent: string,
    externalActivityId: string,
  ): Promise<RunResult> {
    const payload: WorkerJobPayload = {
      files: { [variantConfig.studentFileName]: studentContent },
      testFiles: context.config.testFiles.reduce<Record<string, string>>((acc, file, index) => {
        acc[`${index}-template.validation.sh`] = file.content;
        return acc;
      }, {}),
      srcPath: SRC_PATH,
      testPath: TEST_PATH,
      dependencies: [],
    };

    const encodedDefinition = Buffer.from(JSON.stringify(payload)).toString('base64');
    const jobName = `${variantConfig.jobPrefix}-${externalActivityId.slice(0, 8)}-${Date.now()}`;

    const result = await this.kubernetesService.createAndWaitForJobCompletion(
      jobName,
      variantConfig.imageName,
      variantConfig.executionCommand,
      {
        sharedEmptyDir: {
          volumeName: 'worker-app-volume',
          mounts: [
            { mountPath: SRC_PATH, subPath: 'src' },
            { mountPath: TEST_PATH, subPath: 'test' },
          ],
        },
        initContainers: [
          {
            name: 'eevee-worker-bootstrap',
            image: WORKER_BOOTSTRAP_IMAGE_NAME,
            env: [{ name: WORKER_DEFINITION_B64_ENV_NAME, value: encodedDefinition }],
          },
        ],
      },
    );

    const parsed = variantConfig.processLogResult(result.message);
    const fails = Math.max(parsed.failures, 0);
    const total = parsed.passes + fails;

    return {
      passes: parsed.passes,
      fails,
      score: total > 0 ? parsed.passes / total : 0,
      report: parsed.completeTrace,
      resources: parsed.resources,
    };
  }
}
