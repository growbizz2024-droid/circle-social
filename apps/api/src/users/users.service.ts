import { ThemesService } from '../themes/themes.service.js';
import { AvatarsService, publicAvatar } from '../avatars/avatars.service.js';
import {
  Injectable,
  Inject,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type {
  UserProfile,
  ProfileUpdate,
  OnboardingInput,
} from '@circle/shared-types';
import { ONBOARDING_VIBES } from '@circle/constants';
import { DatabaseService } from '../database/database.service.js';
const select = {
  id: true,
  handle: true,
  status: true,
  displayName: true,
  bio: true,
  avatarId: true,
  profileTheme: true,
  profileAccent: true,
  profileVersion: true,
  onboardingCompletedAt: true,
  onboarding: {
    select: { gender: true, vibe: true, backgroundId: true, interests: true },
  },
} as const;
@Injectable()
export class UsersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AvatarsService) private readonly avatars: AvatarsService,
    @Inject(ThemesService) private readonly themes: ThemesService,
  ) {}
  async me(userId: string): Promise<UserProfile> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select,
    });
    const theme = await this.themes.state(userId);
    return {
      ...user,
      activeTheme: theme.activeTheme,
      themeVersion: theme.themeVersion,
      avatar: publicAvatar(await this.avatars.me(userId)),
      onboarding: user.onboarding as UserProfile['onboarding'],
      onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    };
  }
  async update(userId: string, body: ProfileUpdate): Promise<UserProfile> {
    const { profileVersion, ...data } = body;
    await this.db.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id: userId, status: 'ACTIVE', profileVersion },
        data: {
          ...data,
          ...(data.displayName !== undefined
            ? { displayName: data.displayName || null }
            : {}),
          ...(data.bio !== undefined ? { bio: data.bio || null } : {}),
          profileVersion: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ConflictException('Profile changed; reload before saving');
      await tx.auditEvent.create({ data: { userId, kind: 'profile.updated' } });
    });
    return this.me(userId);
  }
  async completeOnboarding(
    userId: string,
    body: OnboardingInput,
    communityIds?: string[],
  ): Promise<UserProfile> {
    const { profileVersion, ...preferences } = body;
    await this.db.$transaction(async (tx) => {
      if (
        !(await tx.passkey.findFirst({
          where: { userId },
          select: { id: true },
        }))
      )
        throw new ForbiddenException();
      const before = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          onboardingCompletedAt: true,
          profileTheme: true,
          onboarding: { select: { vibe: true } },
        },
      });
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (!before.onboardingCompletedAt && communityIds === undefined)
        throw new ForbiddenException(
          'Complete registration before editing preferences',
        );
      if (communityIds !== undefined) {
        const recovery = await tx.recoveryCredential.findFirst({
          where: {
            userId,
            confirmedAt: { not: null },
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (!recovery)
          throw new ForbiddenException(
            'Confirm your recovery credential before completing registration',
          );
        const communities = await tx.community.count({
          where: { id: { in: communityIds }, isActive: true },
        });
        if (communities !== communityIds.length)
          throw new ForbiddenException('Choose available communities');
        await tx.communityMembership.createMany({
          data: communityIds.map((communityId) => ({
            userId,
            communityId,
            role: 'MEMBER' as const,
          })),
          skipDuplicates: true,
        });
      }
      const updated = await tx.user.updateMany({
        where: { id: userId, status: 'ACTIVE', profileVersion },
        data: {
          onboardingCompletedAt: before.onboardingCompletedAt ?? new Date(),
          profileTheme:
            before.onboarding?.vibe === preferences.vibe
              ? before.profileTheme
              : ONBOARDING_VIBES.find((x) => x.id === preferences.vibe)!.theme,
          profileVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException('Setup changed; reload before finishing');
      await tx.userOnboarding.upsert({
        where: { userId },
        create: { userId, ...preferences },
        update: preferences,
      });
      await tx.auditEvent.create({
        data: {
          userId,
          kind: before.onboardingCompletedAt
            ? 'onboarding.preferences.updated'
            : 'onboarding.completed',
        },
      });
    });
    return this.me(userId);
  }
  async communities(userId: string) {
    return this.db.community.findMany({
      where: { isActive: true, memberships: { some: { userId } } },
      select: { id: true, name: true, slug: true, description: true },
      orderBy: { name: 'asc' },
    });
  }
  async deactivate(
    userId: string,
    handle: string,
    sessionCreatedAt: Date,
    confirmation: string,
  ): Promise<void> {
    if (confirmation !== handle) throw new ForbiddenException();
    if (Date.now() - sessionCreatedAt.getTime() > 300000)
      throw new ForbiddenException();
    await this.db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: userId, status: 'ACTIVE' },
        data: { status: 'DEACTIVATED' },
      });
      if (changed.count !== 1) throw new ConflictException();
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          locationCity: null,
          locationCountry: null,
          locationCountryCode: null,
        },
      });
      await tx.auditEvent.create({
        data: { userId, kind: 'account.deactivated' },
      });
    });
  }
}
