import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  DEFAULT_THEME,
  isThemeConfig,
  themeContrastIssues,
} from '@circle/design-tokens';
import type {
  ThemeConfig,
  ThemeDraft,
  ThemeState,
  SavedTheme,
} from '@circle/shared-types';
import { Prisma } from '../generated/prisma/client.js';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';
const LIMIT = 2 * 1024 * 1024;
const select = {
  id: true,
  name: true,
  description: true,
  revision: true,
  config: true,
  version: true,
  updatedAt: true,
} as const;
type Row = Prisma.CustomThemeGetPayload<{ select: typeof select }>;
function valid(c: unknown): c is ThemeConfig {
  return isThemeConfig(c) && themeContrastIssues(c).length === 0;
}
function dto(row: Row): SavedTheme {
  const supported = row.version === 1 && valid(row.config);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    revision: row.revision,
    config: supported
      ? (row.config as unknown as ThemeConfig)
      : JSON.parse(JSON.stringify(DEFAULT_THEME)),
    supported,
    updatedAt: row.updatedAt.toISOString(),
  };
}
@Injectable()
export class ThemesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CacheService) private readonly cache: CacheService,
  ) {}
  private async rate(id: string) {
    if (!(await this.cache.rateLimit('theme:' + id, 30, 60)))
      throw new HttpException('Please wait before changing more themes', 429);
  }
  private async lock(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM users WHERE id=${id}::uuid AND status='ACTIVE' FOR UPDATE`;
    if (!rows.length) throw new ForbiddenException();
  }
  async state(userId: string): Promise<ThemeState> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        themeVersion: true,
        activeThemeSnapshot: true,
        onboarding: { select: { backgroundId: true } },
        activeTheme: { select: { ...select, deletedAt: true, userId: true } },
      },
    });
    const row = user.activeTheme;
    const snapshot = user.activeThemeSnapshot as {
      name?: unknown;
      revision?: unknown;
      config?: unknown;
    } | null;
    const activeTheme =
      row &&
      row.userId === userId &&
      !row.deletedAt &&
      snapshot &&
      typeof snapshot.name === 'string' &&
      Number.isInteger(snapshot.revision) &&
      valid(snapshot.config)
        ? {
            id: row.id,
            name: snapshot.name,
            revision: snapshot.revision as number,
            config: snapshot.config,
          }
        : null;
    return {
      activeTheme,
      themeVersion: user.themeVersion,
      defaultBackgroundId: user.onboarding?.backgroundId ?? 'ember',
    };
  }
  async list(userId: string) {
    const [items, usage] = await Promise.all([
      this.db.customTheme.findMany({
        where: { userId, deletedAt: null },
        select,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.customTheme.aggregate({
        where: { userId },
        _sum: { byteSize: true },
      }),
    ]);
    return {
      items: items.map(dto),
      bytesUsed: usage._sum.byteSize ?? 0,
      byteLimit: LIMIT,
    };
  }
  private async media(
    tx: Prisma.TransactionClient,
    userId: string,
    config: ThemeConfig,
  ) {
    const id = config.background.imageId;
    if (!id) return;
    if (
      !(await tx.media.findFirst({
        where: {
          id,
          ownerId: userId,
          kind: 'IMAGE',
          postId: null,
          OR: [
            { createdAt: { gte: new Date(Date.now() - 86400000) } },
            { themes: { some: { userId, deletedAt: null } } },
            { appliedThemeUsers: { some: { id: userId } } },
          ],
        },
        select: { id: true },
      }))
    )
      throw new ForbiddenException('Choose an owned background image');
  }
  private async budget(
    tx: Prisma.TransactionClient,
    userId: string,
    size: number,
    replaced = 0,
  ) {
    await tx.customTheme.deleteMany({
      where: {
        userId,
        deletedAt: { lt: new Date(Date.now() - 30 * 86400000) },
      },
    });
    const usage = await tx.customTheme.aggregate({
      where: { userId },
      _sum: { byteSize: true },
    });
    if ((usage._sum.byteSize ?? 0) - replaced + size > LIMIT)
      throw new PayloadTooLargeException('Theme storage limit reached');
  }
  async create(userId: string, body: ThemeDraft) {
    await this.rate(userId);
    const size = Buffer.byteLength(JSON.stringify(body));
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      await this.media(tx, userId, body.config);
      await this.budget(tx, userId, size);
      return dto(
        await tx.customTheme.create({
          data: {
            userId,
            name: body.name,
            description: body.description,
            config: JSON.parse(JSON.stringify(body.config)),
            byteSize: size,
            backgroundMediaId: body.config.background.imageId,
          },
          select,
        }),
      );
    });
  }
  async update(
    userId: string,
    id: string,
    body: ThemeDraft & { revision: number },
  ) {
    await this.rate(userId);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const row = await tx.customTheme.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!row) throw new NotFoundException();
      if (row.revision !== body.revision) throw new ConflictException();
      await this.media(tx, userId, body.config);
      const size = Buffer.byteLength(JSON.stringify(body));
      await this.budget(tx, userId, size, row.byteSize);
      return dto(
        await tx.customTheme.update({
          where: { id },
          data: {
            name: body.name,
            description: body.description,
            config: JSON.parse(JSON.stringify(body.config)),
            version: 1,
            revision: { increment: 1 },
            byteSize: size,
            backgroundMediaId: body.config.background.imageId,
          },
          select,
        }),
      );
    });
  }
  async duplicate(userId: string, id: string) {
    const row = await this.db.customTheme.findFirst({
      where: { id, userId, deletedAt: null },
      select,
    });
    if (!row) throw new NotFoundException();
    const source = dto(row);
    if (!source.supported) throw new ConflictException();
    return this.create(userId, {
      name: source.name.slice(0, 54) + ' copy',
      description: source.description,
      config: source.config,
    });
  }
  async apply(userId: string, id: string, themeVersion: number) {
    await this.rate(userId);
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const row = await tx.customTheme.findFirst({
        where: { id, userId, deletedAt: null },
        select,
      });
      if (!row) throw new NotFoundException();
      if (row.version !== 1 || !valid(row.config))
        throw new ConflictException();
      const changed = await tx.user.updateMany({
        where: { id: userId, themeVersion },
        data: {
          activeThemeId: id,
          activeThemeSnapshot: {
            name: row.name,
            revision: row.revision,
            config: row.config,
          },
          activeThemeMediaId: (row.config as unknown as ThemeConfig).background
            .imageId,
          themeVersion: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException();
    });
    return this.state(userId);
  }
  async defaults(userId: string, themeVersion: number, backgroundId: string) {
    await this.rate(userId);
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const changed = await tx.user.updateMany({
        where: { id: userId, themeVersion },
        data: {
          activeThemeId: null,
          activeThemeSnapshot: Prisma.DbNull,
          activeThemeMediaId: null,
          themeVersion: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException();
      await tx.userOnboarding.upsert({
        where: { userId },
        update: { backgroundId },
        create: {
          userId,
          gender: null,
          vibe: 'BOLD',
          backgroundId,
          interests: [],
        },
      });
    });
    return this.state(userId);
  }
  async remove(userId: string, id: string, revision: number, restore = false) {
    await this.rate(userId);
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, userId);
      const row = await tx.customTheme.findFirst({
        where: {
          id,
          userId,
          revision,
          ...(restore
            ? { deletedAt: { gte: new Date(Date.now() - 30 * 86400000) } }
            : { deletedAt: null }),
        },
      });
      if (!row) throw new ConflictException();
      await tx.customTheme.update({
        where: { id },
        data: {
          deletedAt: restore ? null : new Date(),
          revision: { increment: 1 },
        },
      });
      if (!restore)
        await tx.user.updateMany({
          where: { id: userId, activeThemeId: id },
          data: {
            activeThemeId: null,
            activeThemeSnapshot: Prisma.DbNull,
            activeThemeMediaId: null,
            themeVersion: { increment: 1 },
          },
        });
    });
    return { id, revision: revision + 1, removed: !restore };
  }
}
