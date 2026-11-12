import {
  Injectable,
  Inject,
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import {
  generateAvatar,
  avatarOrFallback,
  renderAvatarSvg,
} from '@circle/avatar-engine';
import type { AvatarRecord, AvatarSpec } from '@circle/shared-types';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';
const select = {
  seed: true,
  config: true,
  version: true,
  revision: true,
  defaultSeed: true,
} as const;
export function publicAvatar(value: unknown): AvatarSpec | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as AvatarSpec;
  return avatarOrFallback(
    { seed: v.seed, version: v.version, config: v.config },
    typeof v.seed === 'string' ? v.seed : 'circle-fallback',
  );
}
@Injectable()
export class AvatarsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CacheService) private readonly cache: CacheService,
  ) {}
  async me(userId: string): Promise<AvatarRecord> {
    const seed = createHash('sha256')
      .update('circle-avatar-v1:' + userId)
      .digest('hex');
    const generated = generateAvatar(seed);
    const row = await this.db.userAvatar.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        seed,
        defaultSeed: seed,
        config: { ...generated.config },
      },
      select,
    });
    return {
      ...publicAvatar(row)!,
      revision: row.revision,
      defaultSeed: row.defaultSeed,
    };
  }
  async rate(userId: string) {
    if (!(await this.cache.rateLimit('avatar:' + userId, 20, 60)))
      throw new HttpException(
        'Please wait before generating more avatars',
        429,
      );
  }
  async generate(userId: string) {
    await this.rate(userId);
    for (let i = 0; i < 8; i++) {
      const spec = generateAvatar(randomUUID());
      if (
        !(await this.db.userAvatar.findFirst({
          where: { config: { equals: { ...spec.config } } },
          select: { id: true },
        }))
      )
        return spec;
    }
    return generateAvatar(randomUUID());
  }
  async save(
    userId: string,
    body: AvatarSpec & { revision: number },
    rate = true,
  ): Promise<AvatarRecord> {
    if (rate) await this.rate(userId);
    await this.me(userId);
    return this.db.$transaction(async (tx) => {
      const user = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE id=${userId}::uuid AND status='ACTIVE' FOR SHARE`;
      if (!user.length) throw new UnauthorizedException();
      const updated = await tx.userAvatar.updateMany({
        where: { userId, revision: body.revision },
        data: {
          seed: body.seed,
          config: { ...body.config },
          version: 1,
          revision: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException('Avatar changed in another session');
      await tx.auditEvent.create({ data: { userId, kind: 'avatar.updated' } });
      const row = await tx.userAvatar.findUniqueOrThrow({
        where: { userId },
        select,
      });
      return {
        ...publicAvatar(row)!,
        revision: row.revision,
        defaultSeed: row.defaultSeed,
      };
    });
  }
  async randomize(userId: string, revision: number) {
    const spec = await this.generate(userId);
    return this.save(userId, { ...spec, revision }, false);
  }
  async reset(userId: string, revision: number) {
    const current = await this.me(userId);
    return this.save(userId, {
      ...generateAvatar(current.defaultSeed),
      revision,
    });
  }
  svg(spec: AvatarSpec) {
    return renderAvatarSvg(spec);
  }
}
