import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { environment } from '../core/environment.js';
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  readonly client = new Redis(environment.REDIS_URL, {
    keyPrefix: 'circle:',
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    commandTimeout: 5000,
    enableOfflineQueue: false,
  });
  constructor() {
    this.client.on('error', () => {
      /* Infrastructure state is reported by readiness; never log connection URLs. */
    });
  }
  async onModuleInit(): Promise<void> {
    await this.client.connect();
    await this.client.ping();
  }
  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
  async take(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }
  async rateLimit(
    key: string,
    limit: number,
    seconds: number,
  ): Promise<boolean> {
    const count = await this.client.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      `rate:${key}`,
      seconds,
    );
    return Number(count) <= limit;
  }
}
