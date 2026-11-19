import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ModuleCredentialGuard } from './guards/module-credential.guard';
import { ModuleContext } from './module-context.decorator';
import { LearningModuleService, assertValidIdempotencyKey } from './learning-module.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { ModuleRequestContext } from './learning-module-assertion.interface';

// /api/v1/module-integration/v1 — the only API surface a learning module is
// allowed to call (guide, "API de integração v1"). Every route here is
// server-to-server: callers are module backends authenticated through
// ModuleCredentialGuard, never a browser directly.
@Controller('module-integration/v1')
@UseGuards(ModuleCredentialGuard)
export class LearningModuleIntegrationController {
  constructor(private readonly learningModuleService: LearningModuleService) {}

  @Get('catalog')
  getCatalog(@ModuleContext() ctx: ModuleRequestContext) {
    return this.learningModuleService.getCatalog(ctx);
  }

  @Get('activities/:externalActivityId/context')
  getContext(
    @Param('externalActivityId') externalActivityId: string,
    @ModuleContext() ctx: ModuleRequestContext,
  ) {
    return this.learningModuleService.getContext(externalActivityId, ctx);
  }

  @Post('activities/:externalActivityId/attempts')
  submitAttempt(
    @Param('externalActivityId') externalActivityId: string,
    @ModuleContext() ctx: ModuleRequestContext,
    @Body() dto: SubmitAttemptDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const key = assertValidIdempotencyKey(idempotencyKey);
    return this.learningModuleService.submitAttempt(externalActivityId, ctx, dto, key);
  }
}
