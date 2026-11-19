import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { LearningModuleClientError } from './learning-module-client';

// Forwards the Integration API's own status/message instead of letting a
// failed fetch() bubble up as an unhandled 500 — it already enforces the
// right denial semantics (404 for unknown/retired/cross-class, 403/401/400),
// this just lets the module frontend see them.
@Catch(LearningModuleClientError)
export class LearningModuleClientExceptionFilter implements ExceptionFilter {
  catch(exception: LearningModuleClientError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.status).json({
      statusCode: exception.status,
      message: exception.message,
    });
  }
}
