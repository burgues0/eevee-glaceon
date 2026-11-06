import { WorkerJobPayload } from 'src/worker/worker-job-payload.type';
import { CreateWorkerDto } from '../dto/create-worker.dto';
import { WorkerType } from '../enum/worker-type.enum';
import { WORKER_IMAGE_NAMES, WORKER_JOB_PREFIX } from '../worker.constants';
import { BootstrapInitContainerStrategy } from './bootstrap-init-container.strategy';
import { WorkerConfig } from './worker-execution-strategy';
import { parseJestLogResult } from './worker-log-parsers';
import {
  asShellCommand,
  buildWriteFileCommand,
  buildWorkerPayload,
  normalizeTestFiles,
} from './worker-strategy-helpers';

/**
 * Strategy for TERRAFORM workers (GLACEON).
 *
 * Student files (.tf) are written by the bootstrap init container under
 * /app/src; validation scripts (shell, exit code 0 = pass) under /app/test.
 * The trigger runs `terraform init` + `terraform apply`, then executes each
 * validation script, and prints a Jest-compatible summary line so the
 * standard log parser keeps working.
 */
export class TerraformDefaultStrategy extends BootstrapInitContainerStrategy {
  readonly workerType = WorkerType.TERRAFORM;

  readonly workerConfig: WorkerConfig = {
    jobPrefix: WORKER_JOB_PREFIX[WorkerType.TERRAFORM],
    imageName: WORKER_IMAGE_NAMES[WorkerType.TERRAFORM],
    srcPath: '/app/src',
    testPath: '/app/test',
  };

  processLogResult = parseJestLogResult;

  buildExecutionJobCommand(_createWorkerData: CreateWorkerDto): string[] {
    // Kubernetes command overrides ENTRYPOINT, so invoke it explicitly
    // (same reasoning as PostgresqlContainerStrategy.withPostgresql).
    return ['/usr/local/bin/eevee-terraform-entrypoint', '/app/trigger.sh'];
  }

  buildWorkerPayload(
    createWorkerData: CreateWorkerDto,
    dependencies: string[],
  ): WorkerJobPayload {
    return buildWorkerPayload({
      files: createWorkerData.files,
      testFilesContent: createWorkerData.testFilesContent,
      testFiles: createWorkerData.testFiles,
      dependencies,
      srcPath: this.workerConfig.srcPath,
      testPath: this.workerConfig.testPath,
      testFileSuffix: 'validation.sh',
    });
  }

  buildJobCommand(
    createWorkerData: CreateWorkerDto,
    _dependencies: string[],
  ): string[] {
    const commands: string[] = [];

    commands.push(
      buildWriteFileCommand(
        createWorkerData.applicationFileContent ?? '',
        '/app/src/main.tf',
      ),
    );

    const normalizedTestFiles = normalizeTestFiles(
      createWorkerData.testFilesContent ?? [],
      createWorkerData.testFiles,
    );

    normalizedTestFiles.forEach((testFile, index) => {
      commands.push(
        buildWriteFileCommand(
          testFile.content,
          `/app/test/validation${index}.sh`,
        ),
      );
    });

    commands.push('/app/trigger.sh');

    return asShellCommand(commands);
  }
}
