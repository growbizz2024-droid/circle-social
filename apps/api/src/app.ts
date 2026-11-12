import { beginRequest } from './core/monitoring.js';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json, raw } from 'express';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import type { Request, Response, NextFunction } from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { CacheService } from './cache/cache.service.js';
import { environment } from './core/environment.js';
import { HttpErrorFilter, ResponseEnvelope, requestId } from './core/http.js';
export async function createApplication() {
  const logger = pino({
    level: environment.LOG_LEVEL,
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'DATABASE_URL',
      'REDIS_URL',
    ],
  });
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: false,
  });
  app.use(helmet());
  app.use(json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const supplied = req.headers['x-request-id'];
    const id =
      typeof supplied === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(supplied)
        ? supplied
        : randomUUID();
    (req as Request & { requestId: string }).requestId = id;
    res.setHeader('x-request-id', id);
    res.setHeader('cache-control', 'no-store');
    const started = Date.now();
    const finish = beginRequest(req.method);
    res.on('finish', () => {
      finish(res.statusCode);
      logger.info(
        {
          requestId: id,
          method: req.method,
          status: res.statusCode,
          durationMs: Date.now() - started,
        },
        'request',
      );
    });
    next();
  });
  app.enableCors({
    origin: environment.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Request-ID', 'Authorization'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalInterceptors(new ResponseEnvelope());
  const cache = app.get(CacheService);
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/v1/health/')) return next();
    try {
      if (!(await cache.rateLimit(`http:${req.ip}`, 120, 60))) {
        res.status(429).json({
          error: { code: 'HTTP_429', message: 'Too many requests' },
          requestId: requestId(req),
        });
        return;
      }
      next();
    } catch {
      res.status(503).json({
        error: { code: 'HTTP_503', message: 'Service unavailable' },
        requestId: requestId(req),
      });
    }
  });
  app.use('/v1/media', raw({ type: ['image/*','audio/*','video/webm'], limit: '12mb' }));
  if (environment.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Circle.social API')
        .setVersion('1')
        .addCookieAuth(sessionCookieName())
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
  app.enableShutdownHooks();
  return app;
}
function sessionCookieName(): string {
  return environment.NODE_ENV === 'production'
    ? '__Host-circle_session'
    : 'circle_session';
}
