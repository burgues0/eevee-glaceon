import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RequestContextService } from 'src/request-context/request-context.service';
import {
  getModuleAudience,
  getModuleSessionCookieName,
  getModuleSessionTtlSeconds,
  isSupportedLearningModuleId,
} from './learning-module.config';

// GET /api/v1/platform/modules/:id/session — issues the eevee_module_<id>
// cookie a module's OWN frontend requests right after EEVEE login (guide,
// "Autenticação e autorização" step 2-3). The cookie is HttpOnly and scoped
// to /modules/<id>/, so only that module's backend ever reads its value.
@Controller('platform/modules')
@UseGuards(JwtAuthGuard)
export class LearningModuleSessionController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly requestContextService: RequestContextService,
  ) {}

  @Get(':id/session')
  issueSession(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    if (!isSupportedLearningModuleId(id)) {
      throw new BadRequestException(`Unknown learning module: ${id}`);
    }

    const user = this.requestContextService.getUser();
    const ttlSeconds = getModuleSessionTtlSeconds(this.configService);

    const token = this.jwtService.sign(
      { sub: user.userId, role: user.role },
      { audience: getModuleAudience(id), expiresIn: ttlSeconds },
    );

    response.cookie(getModuleSessionCookieName(id), token, {
      httpOnly: true,
      path: `/modules/${id}/`,
      sameSite: 'lax',
      secure: this.configService.get<string>('ENV') === 'production',
      maxAge: ttlSeconds * 1000,
    });

    return { issued: true, expiresInSeconds: ttlSeconds };
  }
}
