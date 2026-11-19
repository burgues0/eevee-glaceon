import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ModuleRequestContext } from './learning-module-assertion.interface';

export const ModuleContext = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ModuleRequestContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { moduleContext: ModuleRequestContext }>();
    return request.moduleContext;
  },
);
