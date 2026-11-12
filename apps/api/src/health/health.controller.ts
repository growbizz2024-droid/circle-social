import {
  Controller,
  Get,
  Inject,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { registry } from '../core/monitoring.js';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';
import { QueueService } from '../queue/queue.service.js';
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CacheService) private readonly cache: CacheService,
    @Inject(QueueService) private readonly queues: QueueService,
  ) {}
  @Get('metrics') async metrics(@Res() res: Response) {
    res.type(registry.contentType).send(await registry.metrics());
  }
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    const results = await Promise.allSettled([
      this.db.$queryRaw`SELECT 1`,
      this.cache.client.ping(),
      this.queues.health(),
    ]);
    if (results.some((r) => r.status === 'rejected'))
      throw new ServiceUnavailableException();
    return { status: 'ok', database: 'up', redis: 'up', queues: 'up' };
  }
}
