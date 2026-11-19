import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassAccessService } from 'src/auth/class-access.service';
import { AttemptService } from 'src/attempt/attempt.service';
import { AttemptStatus } from 'src/attempt/enums/attempt-status.enum';
import { Attempt } from 'src/attempt/entities/attempt.entity';
import { Assignment } from 'src/assignment/entities/assignment.entity';
import { ScorePolicyService } from 'src/scheduling/score-policy.service';
import { UserRole } from 'src/user/user-role';
import { LearningModuleActivity } from './entities/learning-module-activity.entity';
import { LearningModuleAttemptIdempotency } from './entities/learning-module-attempt-idempotency.entity';
import { LearningModuleActivityStatus } from './enums/learning-module-activity-status.enum';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { ModuleRequestContext } from './learning-module-assertion.interface';

export interface LearningModuleCatalogEntryV1 {
  externalActivityId: string;
  revision: number;
  status: LearningModuleActivityStatus;
  kind: string;
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

const MIN_IDEMPOTENCY_KEY_LENGTH = 16;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export function assertValidIdempotencyKey(key: string | undefined): string {
  if (
    !key ||
    key.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
    key.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    throw new BadRequestException(
      `Idempotency-Key must be ${MIN_IDEMPOTENCY_KEY_LENGTH}-${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
    );
  }
  return key;
}

@Injectable()
export class LearningModuleService {
  constructor(
    @InjectRepository(LearningModuleActivity)
    private readonly activityRepository: Repository<LearningModuleActivity>,
    @InjectRepository(LearningModuleAttemptIdempotency)
    private readonly idempotencyRepository: Repository<LearningModuleAttemptIdempotency>,
    @InjectRepository(Assignment)
    private readonly assignmentRepository: Repository<Assignment>,
    @InjectRepository(Attempt)
    private readonly attemptRepository: Repository<Attempt>,
    private readonly classAccess: ClassAccessService,
    private readonly attemptService: AttemptService,
    private readonly scorePolicy: ScorePolicyService,
  ) {}

  async getCatalog(ctx: ModuleRequestContext): Promise<LearningModuleCatalogEntryV1[]> {
    const query = this.activityRepository
      .createQueryBuilder('activity')
      .innerJoin('activity.assignment', 'assignment')
      .innerJoin('assignment.class', 'class')
      .where('activity.moduleId = :moduleId', { moduleId: ctx.moduleId })
      .andWhere('activity.status = :status', {
        status: LearningModuleActivityStatus.PUBLISHED,
      });

    if (ctx.role === UserRole.TEACHER) {
      query.andWhere('class.teacherId = :userId', { userId: ctx.userId });
    } else if (ctx.role !== UserRole.ADMIN) {
      query.innerJoin(
        'class.userClasses',
        'userClasses',
        'userClasses.userId = :userId',
        { userId: ctx.userId },
      );
    }

    const activities = await query.getMany();

    return activities.map((activity) => ({
      externalActivityId: activity.externalActivityId,
      revision: activity.revision,
      status: activity.status,
      kind: activity.kind,
      title: activity.title,
      effectiveAt: activity.createdAt.toISOString(),
    }));
  }

  private async findAccessibleActivity(
    externalActivityId: string,
    ctx: ModuleRequestContext,
  ): Promise<LearningModuleActivity> {
    const activity = await this.activityRepository.findOne({
      where: { externalActivityId, moduleId: ctx.moduleId },
    });

    const hiddenFromStudent =
      activity?.status === LearningModuleActivityStatus.DRAFT && ctx.role === UserRole.STUDENT;

    if (!activity || activity.status === LearningModuleActivityStatus.RETIRED || hiddenFromStudent) {
      // Same generic message for unknown/retired/unpublished — never reveal
      // a draft activity's existence to a student hitting the id directly.
      throw new NotFoundException('Unknown or retired activity.');
    }

    if (ctx.role !== UserRole.ADMIN) {
      await this.classAccess.assertAssignmentAccess(activity.assignmentId);
    }

    return activity;
  }

  async getContext(
    externalActivityId: string,
    ctx: ModuleRequestContext,
  ): Promise<LearningModuleActivityContextV1> {
    const activity = await this.findAccessibleActivity(externalActivityId, ctx);

    const assignment = await this.assignmentRepository.findOne({
      where: { id: activity.assignmentId },
      relations: ['assignmentTemplates', 'assignmentTemplates.template'],
    });
    if (!assignment) throw new NotFoundException('Unknown or retired activity.');

    return {
      externalActivityId: activity.externalActivityId,
      title: assignment.title,
      description: assignment.description,
      startDate: assignment.startDate?.toISOString() ?? null,
      dueDate: assignment.dueDate?.toISOString() ?? null,
      maxAttempts: assignment.maxAttempts,
      config: {
        variant: assignment.workerType,
        boilerplateContent: assignment.boilerplateContent ?? '',
        testFiles: (assignment.assignmentTemplates ?? [])
          .map((relation) => ({ content: relation.template?.content ?? '' }))
          .filter((file) => file.content.trim().length > 0),
      },
    };
  }

  async submitAttempt(
    externalActivityId: string,
    ctx: ModuleRequestContext,
    dto: SubmitAttemptDto,
    idempotencyKey: string,
  ): Promise<{ attemptId: number; attempt: number; score: number; isAcceptable: boolean }> {
    const existing = await this.idempotencyRepository.findOne({
      where: { idempotencyKey },
    });
    if (existing) {
      const attempt = await this.attemptRepository.findOneBy({ id: existing.attemptId });
      if (!attempt) throw new NotFoundException('Recorded attempt no longer exists.');
      return {
        attemptId: attempt.id,
        attempt: attempt.attempt,
        score: attempt.score,
        isAcceptable: attempt.isAcceptable,
      };
    }

    if (ctx.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students submit graded attempts.');
    }

    const activity = await this.findAccessibleActivity(externalActivityId, ctx);
    const attemptNumber = await this.attemptService.getNextAttemptNumber(
      activity.assignmentId,
      ctx.userId,
    );
    const isAcceptable = this.scorePolicy.isAcceptable(dto.score);

    const attempt: Attempt = await this.attemptService.createForUser(
      {
        attempt: attemptNumber,
        assignmentId: activity.assignmentId,
        status: AttemptStatus.COMPLETED,
        isAcceptable,
        score: dto.score,
        passes: dto.passes,
        fails: dto.fails,
        report: dto.report,
        resources: dto.resources,
      },
      ctx.userId,
    );

    await this.idempotencyRepository.save({
      idempotencyKey,
      moduleId: ctx.moduleId,
      externalActivityId,
      userId: ctx.userId,
      attemptId: attempt.id,
    });

    return {
      attemptId: attempt.id,
      attempt: attempt.attempt,
      score: attempt.score,
      isAcceptable: attempt.isAcceptable,
    };
  }
}
