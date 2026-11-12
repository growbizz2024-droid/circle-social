import { Module } from '@nestjs/common';
import {
  DatabaseModule,
  CacheModule,
  QueueModule,
  AuthenticationModule,
  HealthModule,
  CommunitiesModule,
  UsersModule,
} from './core/modules.js';
@Module({
  imports: [
    DatabaseModule,
    CacheModule,
    QueueModule,
    AuthenticationModule,
    HealthModule,
    CommunitiesModule,
    UsersModule,
  ],
})
export class AppModule {}
