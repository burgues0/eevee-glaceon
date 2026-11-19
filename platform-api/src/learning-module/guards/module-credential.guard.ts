import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { UserService } from 'src/user/user.service';
import {
  getModuleAudience,
  getModuleCredential,
  getModuleJwtSecret,
  isSupportedLearningModuleId,
} from '../learning-module.config';
import { LearningModuleAssertionPayload, ModuleRequestContext } from '../learning-module-assertion.interface';

// Validates the 3 headers the Integration API client sends on every call
// (guide, "O cliente envia automaticamente"): module credential, module
// assertion (short-lived user JWT) and module id. On success it also
// populates the request-scoped CLS "user" slot so the rest of the app
// (ClassAccessService, AttemptService, ...) can keep treating the resolved
// user as "the current user" without knowing a module is involved.
@Injectable()
export class ModuleCredentialGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly clsService: ClsService,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const moduleId = request.headers['x-eevee-learning-module'];
    const credential = request.headers['x-eevee-module-credential'];
    const assertion = request.headers['x-eevee-module-assertion'];

    if (
      typeof moduleId !== 'string' ||
      typeof credential !== 'string' ||
      typeof assertion !== 'string' ||
      !isSupportedLearningModuleId(moduleId)
    ) {
      throw new UnauthorizedException('Invalid module credentials.');
    }

    const expectedCredential = getModuleCredential(this.configService, moduleId);
    if (!expectedCredential || credential !== expectedCredential) {
      throw new UnauthorizedException('Invalid module credentials.');
    }

    let payload: LearningModuleAssertionPayload;
    try {
      payload = this.jwtService.verify<LearningModuleAssertionPayload>(assertion, {
        secret: getModuleJwtSecret(this.configService),
        audience: getModuleAudience(moduleId),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired module assertion.');
    }

    const user = await this.userService.findOne(payload.sub);
    if (!user) throw new UnauthorizedException('Invalid module assertion.');

    this.clsService.set('user', {
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const moduleContext: ModuleRequestContext = {
      moduleId,
      userId: user.id,
      role: user.role,
    };
    (request as Request & { moduleContext: ModuleRequestContext }).moduleContext = moduleContext;

    return true;
  }
}
