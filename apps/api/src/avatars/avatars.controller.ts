import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  Res,
  Param,
  Inject,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import {
  IdentityGuard,
  identity,
  type IdentityRequest,
} from '../users/identity.guard.js';
import { validate } from '../core/http.js';
import { avatarUpdateSchema, avatarRevisionSchema } from '@circle/validation';
import { AvatarsService } from './avatars.service.js';
@Controller('avatars')
@UseGuards(IdentityGuard)
export class AvatarsController {
  private readonly cache = new Map<string, Buffer>();
  constructor(
    @Inject(AvatarsService) private readonly avatars: AvatarsService,
  ) {}
  @Post('generate') generate(
    @Req() req: IdentityRequest,
    @Body() body: unknown,
  ) {
    validate(z.object({}).strict(), body);
    return this.avatars.generate(identity(req).userId);
  }
  @Get('me') me(@Req() req: IdentityRequest) {
    return this.avatars.me(identity(req).userId);
  }
  @Patch('me') save(@Req() req: IdentityRequest, @Body() body: unknown) {
    return this.avatars.save(
      identity(req).userId,
      validate(avatarUpdateSchema, body),
    );
  }
  @Post('me/randomize') @HttpCode(200) randomize(
    @Req() req: IdentityRequest,
    @Body() body: unknown,
  ) {
    return this.avatars.randomize(
      identity(req).userId,
      validate(avatarRevisionSchema, body).revision,
    );
  }
  @Post('me/reset') @HttpCode(200) reset(
    @Req() req: IdentityRequest,
    @Body() body: unknown,
  ) {
    return this.avatars.reset(
      identity(req).userId,
      validate(avatarRevisionSchema, body).revision,
    );
  }
  @Get('me/export/:format') async export(
    @Req() req: IdentityRequest,
    @Param('format') format: string,
    @Res() res: Response,
  ) {
    const type = validate(z.enum(['svg', 'png']), format),
      spec = await this.avatars.me(identity(req).userId),
      svg = this.avatars.svg(spec),
      key = createHash('sha256')
        .update(type + svg)
        .digest('hex'),
      etag = '"' + key + '"';
    res.set({
      ETag: etag,
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename="circle-avatar.${type}"`,
      'Content-Type': type === 'svg' ? 'image/svg+xml' : 'image/png',
    });
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    let bytes = this.cache.get(key);
    if (!bytes) {
      bytes =
        type === 'svg'
          ? Buffer.from(svg)
          : await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer();
      if (this.cache.size >= 64)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, bytes);
    }
    res.send(bytes);
  }
}
