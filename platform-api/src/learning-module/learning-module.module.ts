import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from 'src/assignment/entities/assignment.entity';
import { Attempt } from 'src/attempt/entities/attempt.entity';
import { AttemptModule } from 'src/attempt/attempt.module';
import { RequestContextModule } from 'src/request-context/request-context.module';
import { ScorePolicyService } from 'src/scheduling/score-policy.service';
import { UserModule } from 'src/user/user.module';
import { LearningModuleActivity } from './entities/learning-module-activity.entity';
import { LearningModuleAttemptIdempotency } from './entities/learning-module-attempt-idempotency.entity';
import { ModuleCredentialGuard } from './guards/module-credential.guard';
import { LearningModuleIntegrationController } from './learning-module-integration.controller';
import { LearningModuleSessionController } from './learning-module-session.controller';
import { LearningModuleService } from './learning-module.service';
import { getModuleJwtSecret } from './learning-module.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LearningModuleActivity,
      LearningModuleAttemptIdempotency,
      Assignment,
      Attempt,
    ]),
    // Separate secret from the main eevee_auth JWT (falls back to JWT_SECRET
    // if LEARNING_MODULE_JWT_SECRET isn't set) — a leaked module assertion
    // must not double as a full EEVEE session token, or vice versa.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: getModuleJwtSecret(configService),
      }),
      inject: [ConfigService],
    }),
    AttemptModule,
    UserModule,
    RequestContextModule,
  ],
  controllers: [LearningModuleSessionController, LearningModuleIntegrationController],
  providers: [LearningModuleService, ModuleCredentialGuard, ScorePolicyService],
})
export class LearningModuleModule {}
