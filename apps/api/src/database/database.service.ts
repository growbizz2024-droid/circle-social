import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { shutdownMonitoring } from '../core/monitoring.js';
import { environment } from '../core/environment.js';
@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: environment.DATABASE_URL,
        max: environment.DATABASE_POOL_MAX,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        statement_timeout: 5000,
      }),
    });
  }
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await shutdownMonitoring();
  }
}
