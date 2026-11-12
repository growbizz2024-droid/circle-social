import { ThemesService } from '../themes/themes.service.js';
import { ThemesController } from '../themes/themes.controller.js';
import { AvatarsService } from '../avatars/avatars.service.js';
import { AvatarsController } from '../avatars/avatars.controller.js';
import { MediaService } from '../feed/media.service.js';
import { MediaController } from '../feed/media.controller.js';
import { FeedService } from '../feed/feed.service.js';
import { SocialFeedController } from '../feed/feed.controller.js';
import { Module, Global } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';
import { QueueService } from '../queue/queue.service.js';
import { GeoIpService } from '../location/geoip.service.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthController } from '../auth/auth.controller.js';
import { HealthController } from '../health/health.controller.js';
import { CommunitiesController } from '../communities/communities.controller.js';
@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
@Global()
@Module({ providers: [AvatarsService], exports: [AvatarsService] })
export class AvatarCoreModule {}
@Global()
@Module({ providers: [ThemesService], exports: [ThemesService] })
export class ThemeCoreModule {}
@Module({
  imports: [AvatarCoreModule, ThemeCoreModule],
  providers: [AuthService, GeoIpService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthenticationModule {}
@Module({ controllers: [HealthController] })
export class HealthModule {}
@Module({ controllers: [CommunitiesController] })
export class CommunitiesModule {}

import { UsersController } from '../users/users.controller.js';
import { UsersService } from '../users/users.service.js';
import { IdentityGuard } from '../users/identity.guard.js';
@Module({
  imports: [AuthenticationModule],
  providers: [UsersService, IdentityGuard, FeedService, MediaService],
  controllers: [
    UsersController,
    SocialFeedController,
    MediaController,
    AvatarsController,
    ThemesController,
  ],
})
export class UsersModule {}
