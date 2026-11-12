import {
  Catch,
  HttpException,
  type ExceptionFilter,
  type ArgumentsHost,
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { map } from 'rxjs';
import { z } from 'zod';
import { reportInternalError } from './monitoring.js';
export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpException('Invalid request', 400);
  return parsed.data;
}
export function requestId(req: Request): string {
  return String(
    (req as Request & { requestId?: string }).requestId ?? 'unknown',
  );
}
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500) reportInternalError();
    const message =
      status >= 500
        ? 'Service unavailable'
        : ({
            400: 'Invalid request',
            401: 'Authentication required',
            403: 'Request forbidden',
            404: 'Not found',
            409: 'Conflict',
            429: 'Too many requests',
          }[status] ?? 'Request failed');
    response
      .status(status)
      .json({
        error: { code: `HTTP_${status}`, message },
        requestId: requestId(http.getRequest<Request>()),
      });
  }
}
@Injectable()
export class ResponseEnvelope implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next
      .handle()
      .pipe(
        map((data) => ({
          data,
          requestId: requestId(context.switchToHttp().getRequest<Request>()),
        })),
      );
  }
}
