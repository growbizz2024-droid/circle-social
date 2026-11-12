import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { parseBuffer } from 'music-metadata';
import { DatabaseService } from '../database/database.service.js';
import type { PostMedia } from '@circle/shared-types';
export const mediaSelect = {
  id: true,
  kind: true,
  mimeType: true,
  durationSeconds: true,
} as const;
export function mediaDto(m: {
  id: string;
  kind: string;
  mimeType: string;
  durationSeconds: number | null;
}): PostMedia {
  return { ...m, kind: m.kind as PostMedia['kind'], url: `/v1/media/${m.id}` };
}
@Injectable()
export class MediaService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async upload(userId: string, input: Buffer, contentType: string) {
    if (!Buffer.isBuffer(input) || !input.length)
      throw new BadRequestException();
    if (input.length > 12 * 1024 * 1024) throw new PayloadTooLargeException();
    const user = await this.db.user.findFirst({
      where: {
        id: userId,
        status: 'ACTIVE',
        onboardingCompletedAt: { not: null },
      },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException();
    let bytes: Buffer,
      mimeType: string,
      kind: string,
      durationSeconds: number | null = null;
    if (contentType.startsWith('image/')) {
      try {
        const image = sharp(input, {
          limitInputPixels: 24_000_000,
          failOn: 'warning',
          animated: false,
        });
        const meta = await image.metadata();
        if (
          !['jpeg', 'png', 'webp', 'heif'].includes(meta.format ?? '') ||
          (meta.pages ?? 1) > 1
        )
          throw new Error();
        bytes = await image
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();
        mimeType = 'image/jpeg';
        kind = 'IMAGE';
      } catch {
        throw new BadRequestException('Unsupported image');
      }
    } else if (
      contentType.startsWith('audio/') ||
      contentType === 'video/webm'
    ) {
      try {
        const meta = await parseBuffer(input, undefined, { duration: true });
        const f = meta.format,
          duration = f.duration;
        if (
          !duration ||
          !Number.isFinite(duration) ||
          duration < 0.2 ||
          duration > 120.5 ||
          f.hasVideo
        )
          throw new Error();
        const container = f.container ?? '';
        if (container === 'WAVE') mimeType = 'audio/wav';
        else if (container === 'MPEG') mimeType = 'audio/mpeg';
        else if (container.includes('WebM') || container === 'EBML')
          mimeType = 'audio/webm';
        else if (container === 'Ogg') mimeType = 'audio/ogg';
        else if (
          container.includes('M4A') ||
          container.includes('MP4') ||
          container === 'isom' ||
          container === 'MPEG-4'
        )
          mimeType = 'audio/mp4';
        else throw new Error();
        bytes = input;
        kind = 'AUDIO';
        durationSeconds = Math.min(duration, 120);
      } catch {
        throw new BadRequestException('Unsupported audio');
      }
    } else throw new BadRequestException();
    return this.db.$transaction(async (tx) => {
      // Serialize uploads per account to enforce a bounded local-store quota.
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid AND status='ACTIVE' FOR UPDATE`;
      await tx.media.deleteMany({
        where: {
          ownerId: userId,
          postId: null,
          themes: { none: {} },
          appliedThemeUsers: { none: {} },
          createdAt: { lt: new Date(Date.now() - 86400000) },
        },
      });
      const used = await tx.media.aggregate({
        where: { ownerId: userId },
        _sum: { size: true },
      });
      if ((used._sum.size ?? 0) + bytes.length > 100 * 1024 * 1024)
        throw new PayloadTooLargeException();
      return mediaDto(
        await tx.media.create({
          data: {
            ownerId: userId,
            kind,
            mimeType,
            bytes: new Uint8Array(bytes),
            size: bytes.length,
            durationSeconds,
          },
          select: mediaSelect,
        }),
      );
    });
  }
  async read(userId: string, id: string) {
    if (
      !(await this.db.user.findFirst({
        where: {
          id: userId,
          status: 'ACTIVE',
          onboardingCompletedAt: { not: null },
        },
        select: { id: true },
      }))
    )
      throw new ForbiddenException();
    const media = await this.db.media.findFirst({
      where: {
        id,
        owner: { status: 'ACTIVE' },
        OR: [
          { themes: { some: { userId, deletedAt: null } } },
          { appliedThemeUsers: { some: { id: userId } } },
          {
            ownerId: userId,
            postId: null,
            createdAt: { gte: new Date(Date.now() - 86400000) },
          },
          {
            post: {
              deletedAt: null,
              author: { status: 'ACTIVE' },
              community: { isActive: true },
            },
          },
        ],
      },
    });
    if (!media) throw new NotFoundException();
    return media;
  }
  async discard(userId: string, id: string) {
    const result = await this.db.media.deleteMany({
      where: {
        id,
        ownerId: userId,
        postId: null,
        themes: { none: {} },
        appliedThemeUsers: { none: {} },
      },
    });
    if (!result.count) throw new NotFoundException();
    return { removed: true };
  }
}
