import { publicAvatar } from '../avatars/avatars.service.js';
import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { DatabaseService } from '../database/database.service.js';
import type {
  FeedPost,
  HomeFeed,
  FeedComment,
  FeedActivity,
} from '@circle/shared-types';
import { feedQuerySchema, createPostSchema } from '@circle/validation';
import type { z } from 'zod';
import { mediaSelect, mediaDto } from './media.service.js';
import { INTERESTS } from '@circle/constants';
const authorSelect = {
  handle: true,
  displayName: true,
  avatarId: true,
  avatar: { select: { seed: true, config: true, version: true } },
} as const;
const postSelect = (viewer: string) =>
  ({
    id: true,
    text: true,
    mediaUrls: true,
    attachments: { select: mediaSelect, orderBy: { createdAt: 'asc' } },
    createdAt: true,
    community: {
      select: { id: true, name: true, slug: true, description: true },
    },
    author: {
      select: {
        ...authorSelect,
        followers: {
          where: { followerId: viewer },
          select: { followerId: true },
        },
      },
    },
    likes: { where: { userId: viewer }, select: { userId: true } },
    saves: { where: { userId: viewer }, select: { userId: true } },
    reposts: { where: { userId: viewer }, select: { userId: true } },
    _count: { select: { likes: true, comments: true, reposts: true } },
  }) as const;
type Row = Prisma.PostGetPayload<{ select: ReturnType<typeof postSelect> }>;
const dto = (p: Row): FeedPost => ({
  id: p.id,
  text: p.text,
  mediaUrls: p.mediaUrls,
  attachments: p.attachments.map(mediaDto),
  createdAt: p.createdAt.toISOString(),
  community: p.community,
  author: {
    handle: p.author.handle,
    displayName: p.author.displayName,
    avatarId: p.author.avatarId,
    avatar: publicAvatar(p.author.avatar),
  },
  liked: !!p.likes.length,
  saved: !!p.saves.length,
  reposted: !!p.reposts.length,
  following: !!p.author.followers.length,
  counts: p._count,
});
const visible = {
  deletedAt: null,
  author: { status: 'ACTIVE' as const },
  community: { isActive: true },
};
@Injectable()
export class FeedService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  private async ready(userId: string) {
    const user = await this.db.user.findFirst({
      where: {
        id: userId,
        status: 'ACTIVE',
        onboardingCompletedAt: { not: null },
      },
      include: { onboarding: true },
    });
    if (!user)
      throw new ForbiddenException(
        'Complete registration before using your feed',
      );
    return user;
  }
  private async lockViewer(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM users WHERE id=${userId}::uuid AND status='ACTIVE' AND "onboardingCompletedAt" IS NOT NULL FOR SHARE`;
    if (!rows.length) throw new ForbiddenException();
  }
  private async lockPost(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      { id: string; authorId: string }[]
    >`SELECT p.id,p."authorId" FROM posts p JOIN users u ON u.id=p."authorId" JOIN communities c ON c.id=p."communityId" WHERE p.id=${id}::uuid AND p."deletedAt" IS NULL AND u.status='ACTIVE' AND c."isActive"=true FOR SHARE OF p`;
    if (!rows.length) throw new NotFoundException('Post unavailable');
    return rows[0];
  }
  async list(
    userId: string,
    query: z.infer<typeof feedQuerySchema>,
  ): Promise<HomeFeed> {
    const user = await this.ready(userId);
    const communities = await this.db.community.findMany({
      where: { isActive: true, memberships: { some: { userId } } },
      select: { id: true, name: true, slug: true, description: true },
      orderBy: { name: 'asc' },
    });
    const interests = user.onboarding?.interests ?? [];
    const where: Prisma.PostWhereInput = { ...visible };
    if (query.communityId) where.communityId = query.communityId;
    if (query.topic) where.interests = { has: query.topic };
    if (query.tab === 'following')
      where.author = {
        status: 'ACTIVE',
        followers: { some: { followerId: userId } },
      };
    if (query.tab === 'saved') where.saves = { some: { userId } };
    if (query.q)
      where.OR = [
        { text: { contains: query.q, mode: 'insensitive' } },
        { author: { handle: { contains: query.q, mode: 'insensitive' } } },
        { author: { displayName: { contains: query.q, mode: 'insensitive' } } },
        { community: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    if (
      query.tab === 'for-you' &&
      !query.q &&
      !query.communityId &&
      !query.topic
    ) {
      const or: Prisma.PostWhereInput[] = [];
      if (communities.length)
        or.push({ communityId: { in: communities.map((c) => c.id) } });
      if (interests.length) or.push({ interests: { hasSome: interests } });
      if (or.length) where.OR = or;
    }
    if (query.tab === 'trending')
      where.createdAt = { gte: new Date(Date.now() - 7 * 86400000) };
    const items = await this.db.post.findMany({
      where,
      orderBy:
        query.tab === 'trending'
          ? [
              { likes: { _count: 'desc' } },
              { reposts: { _count: 'desc' } },
              { comments: { _count: 'desc' } },
              { createdAt: 'desc' },
              { id: 'desc' },
            ]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
      select: postSelect(userId),
    });
    return { items: items.map(dto), communities, interests };
  }
  async get(userId: string, id: string): Promise<FeedPost> {
    await this.ready(userId);
    const p = await this.db.post.findFirst({
      where: { id, ...visible },
      select: postSelect(userId),
    });
    if (!p) throw new NotFoundException('Post unavailable');
    return dto(p);
  }
  async publish(userId: string, body: z.infer<typeof createPostSchema>) {
    const id = await this.db.$transaction(async (tx) => {
      await this.lockViewer(tx, userId);
      const member = await tx.$queryRaw<
        { userId: string }[]
      >`SELECT m."userId" FROM community_memberships m JOIN communities c ON c.id=m."communityId" WHERE m."userId"=${userId}::uuid AND m."communityId"=${body.communityId}::uuid AND c."isActive"=true FOR SHARE OF m`;
      if (!member.length)
        throw new ForbiddenException('Join this community before posting');
      const attachments = await tx.media.findMany({
        where: {
          id: { in: body.attachmentIds },
          ownerId: userId,
          postId: null,
          createdAt: { gte: new Date(Date.now() - 86400000) },
        },
        select: { id: true, kind: true },
      });
      if (
        attachments.length !== body.attachmentIds.length ||
        attachments.length + body.mediaUrls.length > 3 ||
        attachments.filter((m) => m.kind === 'AUDIO').length > 1 ||
        (attachments.some((m) => m.kind === 'AUDIO') &&
          (attachments.length > 1 || body.mediaUrls.length))
      )
        throw new ForbiddenException('Invalid attachments');
      const post = await tx.post.create({
        data: {
          authorId: userId,
          communityId: body.communityId,
          text: body.text,
          mediaUrls: body.mediaUrls,
          interests: [...new Set(body.interests)],
        },
      });
      if (attachments.length) {
        const attached = await tx.media.updateMany({
          where: {
            id: { in: body.attachmentIds },
            ownerId: userId,
            postId: null,
          },
          data: { postId: post.id },
        });
        if (attached.count !== attachments.length)
          throw new ConflictException();
      }
      return post.id;
    });
    return this.get(userId, id);
  }
  async react(
    userId: string,
    id: string,
    kind: 'like' | 'save' | 'repost',
    active: boolean,
  ) {
    await this.db.$transaction(async (tx) => {
      await this.lockViewer(tx, userId);
      const post = await this.lockPost(tx, id);
      const data = { userId, postId: id };
      let count = 0;
      if (kind === 'like')
        count = (
          active
            ? await tx.postLike.createMany({
                data: [data],
                skipDuplicates: true,
              })
            : await tx.postLike.deleteMany({ where: data })
        ).count;
      if (kind === 'save')
        count = (
          active
            ? await tx.postSave.createMany({
                data: [data],
                skipDuplicates: true,
              })
            : await tx.postSave.deleteMany({ where: data })
        ).count;
      if (kind === 'repost')
        count = (
          active
            ? await tx.postRepost.createMany({
                data: [data],
                skipDuplicates: true,
              })
            : await tx.postRepost.deleteMany({ where: data })
        ).count;
      if (kind !== 'save' && post.authorId !== userId) {
        const event = kind === 'like' ? 'LIKE' : 'REPOST';
        if (active && count)
          await tx.activity.create({
            data: {
              recipientId: post.authorId,
              actorId: userId,
              postId: id,
              kind: event,
            },
          });
        if (!active)
          await tx.activity.deleteMany({
            where: {
              recipientId: post.authorId,
              actorId: userId,
              postId: id,
              kind: event,
            },
          });
      }
    });
    return this.get(userId, id);
  }
  async comments(userId: string, id: string): Promise<FeedComment[]> {
    await this.get(userId, id);
    const comments = await this.db.comment.findMany({
      where: { postId: id, user: { status: 'ACTIVE' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
      select: {
        id: true,
        text: true,
        createdAt: true,
        user: { select: authorSelect },
      },
    });
    return comments.reverse().map((c) => ({
      id: c.id,
      text: c.text,
      createdAt: c.createdAt.toISOString(),
      author: { ...c.user, avatar: publicAvatar(c.user.avatar) },
    }));
  }
  async comment(userId: string, id: string, text: string) {
    await this.db.$transaction(async (tx) => {
      await this.lockViewer(tx, userId);
      const post = await this.lockPost(tx, id);
      await tx.comment.create({ data: { userId, postId: id, text } });
      if (post.authorId !== userId)
        await tx.activity.create({
          data: {
            recipientId: post.authorId,
            actorId: userId,
            postId: id,
            kind: 'COMMENT',
          },
        });
    });
    return {
      post: await this.get(userId, id),
      comments: await this.comments(userId, id),
    };
  }
  async follow(userId: string, handle: string, active: boolean) {
    await this.db.$transaction(async (tx) => {
      await this.lockViewer(tx, userId);
      const target = await tx.user.findFirst({
        where: { handle, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!target) throw new NotFoundException();
      if (target.id === userId)
        throw new ForbiddenException('You cannot follow yourself');
      const where = { followerId: userId, followingId: target.id };
      if (active) {
        const added = await tx.userFollow.createMany({
          data: [where],
          skipDuplicates: true,
        });
        if (added.count)
          await tx.activity.create({
            data: { recipientId: target.id, actorId: userId, kind: 'FOLLOW' },
          });
      } else {
        await tx.userFollow.deleteMany({ where });
        await tx.activity.deleteMany({
          where: { recipientId: target.id, actorId: userId, kind: 'FOLLOW' },
        });
      }
    });
    return { following: active };
  }
  async membership(userId: string, communityId: string, active: boolean) {
    await this.db.$transaction(async (tx) => {
      await this.lockViewer(tx, userId);
      const c = await tx.community.findFirst({
        where: { id: communityId, isActive: true },
      });
      if (!c) throw new NotFoundException();
      const key = { userId, communityId };
      if (active)
        await tx.communityMembership.upsert({
          where: { userId_communityId: key },
          create: { ...key, role: 'MEMBER' },
          update: {},
        });
      else {
        const m = await tx.communityMembership.findUnique({
          where: { userId_communityId: key },
        });
        if (m?.role === 'OWNER')
          throw new ConflictException(
            'Transfer ownership before leaving this community',
          );
        await tx.communityMembership.deleteMany({ where: key });
      }
    });
    return { joined: active };
  }
  private activityWhere(userId: string): Prisma.ActivityWhereInput {
    return {
      recipientId: userId,
      actor: { status: 'ACTIVE' },
      OR: [
        { postId: null },
        {
          post: {
            deletedAt: null,
            author: { status: 'ACTIVE' },
            community: { isActive: true },
          },
        },
      ],
    };
  }
  async activity(
    userId: string,
  ): Promise<{ items: FeedActivity[]; unreadCount: number }> {
    await this.ready(userId);
    const where = this.activityWhere(userId);
    const [items, unreadCount] = await Promise.all([
      this.db.activity.findMany({
        where,
        orderBy: [
          { readAt: { sort: 'desc', nulls: 'first' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 20,
        select: {
          id: true,
          kind: true,
          postId: true,
          createdAt: true,
          readAt: true,
          actor: { select: authorSelect },
        },
      }),
      this.db.activity.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      items: items.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        readAt: i.readAt?.toISOString() ?? null,
        actor: { ...i.actor, avatar: publicAvatar(i.actor.avatar) },
      })),
      unreadCount,
    };
  }
  async readActivity(userId: string, ids: string[]) {
    await this.ready(userId);
    await this.db.activity.updateMany({
      where: { recipientId: userId, id: { in: ids }, readAt: null },
      data: { readAt: new Date() },
    });
    return this.activity(userId);
  }
  async discovery(userId: string, q: string) {
    await this.ready(userId);
    const [counts, people, communities] = await Promise.all([
      this.db.$queryRaw<
        { topic: string; posts: bigint }[]
      >`SELECT unnest(p.interests) AS topic, count(*)::bigint AS posts FROM posts p JOIN users u ON u.id=p."authorId" JOIN communities c ON c.id=p."communityId" WHERE p."deletedAt" IS NULL AND u.status='ACTIVE' AND c."isActive"=true AND p."createdAt">now()-interval '7 days' GROUP BY topic ORDER BY posts DESC, topic LIMIT 15`,
      this.db.user.findMany({
        where: {
          status: 'ACTIVE',
          onboardingCompletedAt: { not: null },
          id: { not: userId },
          ...(q
            ? {
                OR: [
                  { handle: { contains: q, mode: 'insensitive' } },
                  { displayName: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select: {
          ...authorSelect,
          followers: {
            where: { followerId: userId },
            select: { followerId: true },
          },
        },
      }),
      this.db.community.findMany({
        where: {
          isActive: true,
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { description: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        take: 20,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          _count: {
            select: { memberships: { where: { user: { status: 'ACTIVE' } } } },
          },
          memberships: { where: { userId }, select: { userId: true } },
        },
      }),
    ]);
    return {
      topics: counts.flatMap((c) => {
        const topic = INTERESTS.find((t) => t.id === c.topic);
        return topic &&
          (!q || topic.label.toLowerCase().includes(q.toLowerCase()))
          ? [{ id: topic.id, label: topic.label, posts: Number(c.posts) }]
          : [];
      }),
      people: people.map(({ followers, ...p }) => ({
        ...p,
        following: !!followers.length,
        avatar: publicAvatar(p.avatar),
      })),
      communities: communities.map(({ memberships, _count, ...c }) => ({
        ...c,
        memberCount: _count.memberships,
        joined: !!memberships.length,
      })),
    };
  }
  async communityDetail(userId: string, id: string) {
    await this.ready(userId);
    const c = await this.db.community.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        memberships: { where: { userId }, select: { userId: true } },
        _count: {
          select: {
            memberships: { where: { user: { status: 'ACTIVE' } } },
            posts: { where: { deletedAt: null, author: { status: 'ACTIVE' } } },
          },
        },
      },
    });
    if (!c) throw new NotFoundException();
    const { memberships, _count, ...rest } = c;
    return {
      ...rest,
      memberCount: _count.memberships,
      postCount: _count.posts,
      joined: !!memberships.length,
    };
  }
  async remove(userId: string, id: string, restore = false) {
    await this.db.$transaction(async (tx) => {
      await this.lockViewer(tx, userId);
      const p = await tx.post.findFirst({ where: { id, authorId: userId } });
      if (!p) throw new NotFoundException();
      await tx.post.update({
        where: { id },
        data: { deletedAt: restore ? null : new Date() },
      });
    });
    return { removed: !restore };
  }
}
