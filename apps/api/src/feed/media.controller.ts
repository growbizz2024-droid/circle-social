import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Req,
  Res,
  Inject,
  UseGuards,
  HttpException,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  IdentityGuard,
  identity,
  type IdentityRequest,
} from '../users/identity.guard.js';
import { validate } from '../core/http.js';
import { z } from 'zod';
import { MediaService } from './media.service.js';
@Controller('media')
@UseGuards(IdentityGuard)
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}
  @Post() @HttpCode(201) upload(@Req() req: IdentityRequest) {
    return this.media.upload(
      identity(req).userId,
      req.body as Buffer,
      (req.headers['content-type'] ?? '').split(';')[0],
    );
  }
  @Delete(':id') discard(@Req() req: IdentityRequest, @Param('id') id: string) {
    return this.media.discard(identity(req).userId, validate(z.uuid(), id));
  }
  @Get(':id') async read(
    @Req() req: IdentityRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const media = await this.media.read(
      identity(req).userId,
      validate(z.uuid(), id),
    );
    const bytes = Buffer.from(media.bytes),
      range = req.headers.range;
    res.set({
      'Content-Type': media.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'inline',
    });
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!m) throw new HttpException('Invalid range', 416);
      const start = Number(m[1]),
        end = m[2]
          ? Math.min(Number(m[2]), bytes.length - 1)
          : bytes.length - 1;
      if (
        !Number.isSafeInteger(start) ||
        start > end ||
        start >= bytes.length
      ) {
        res.set('Content-Range', `bytes */${bytes.length}`);
        throw new HttpException('Invalid range', 416);
      }
      res
        .status(206)
        .set({
          'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
          'Content-Length': String(end - start + 1),
        })
        .send(bytes.subarray(start, end + 1));
    } else res.set('Content-Length', String(bytes.length)).send(bytes);
  }
}
