import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Inject,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiBody, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  feedQuerySchema,
  createPostSchema,
  postCommentSchema,
  activeStateSchema,
  handleSchema,
} from '@circle/validation';
import {
  IdentityGuard,
  identity,
  type IdentityRequest,
} from '../users/identity.guard.js';
import { validate } from '../core/http.js';
import { FeedService } from './feed.service.js';
const uuid = (value: string) => validate(z.uuid(), value);
@ApiTags('Social feed')
@UseGuards(IdentityGuard)
@Controller()
export class SocialFeedController {
  constructor(@Inject(FeedService) private readonly feed: FeedService) {}
  @Get('discover') discovery(
    @Req() req: IdentityRequest,
    @Query() query: unknown,
  ) {
    return this.feed.discovery(
      identity(req).userId,
      validate(
        z.object({ q: z.string().trim().max(80).default('') }).strict(),
        query,
      ).q,
    );
  }
  @Get('communities/:id/detail') detail(
    @Req() req: IdentityRequest,
    @Param('id') id: string,
  ) {
    return this.feed.communityDetail(identity(req).userId, uuid(id));
  }
  @Get('feed') list(@Req() req: IdentityRequest, @Query() query: unknown) {
    return this.feed.list(
      identity(req).userId,
      validate(feedQuerySchema, query),
    );
  }
  @Get('posts/:id') get(@Req() req: IdentityRequest, @Param('id') id: string) {
    return this.feed.get(identity(req).userId, uuid(id));
  }
  @ApiBody({
    schema: z.toJSONSchema(createPostSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Post('posts')
  publish(@Req() req: IdentityRequest, @Body() body: unknown) {
    return this.feed.publish(
      identity(req).userId,
      validate(createPostSchema, body),
    );
  }
  @Put('posts/:id/:kind') react(
    @Req() req: IdentityRequest,
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ) {
    return this.feed.react(
      identity(req).userId,
      uuid(id),
      validate(z.enum(['like', 'save', 'repost']), kind),
      validate(activeStateSchema, body).active,
    );
  }
  @Get('posts/:id/comments') comments(
    @Req() req: IdentityRequest,
    @Param('id') id: string,
  ) {
    return this.feed.comments(identity(req).userId, uuid(id));
  }
  @Post('posts/:id/comments') @HttpCode(200) comment(
    @Req() req: IdentityRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.feed.comment(
      identity(req).userId,
      uuid(id),
      validate(postCommentSchema, body).text,
    );
  }
  @Put('profiles/:handle/follow') follow(
    @Req() req: IdentityRequest,
    @Param('handle') handle: string,
    @Body() body: unknown,
  ) {
    return this.feed.follow(
      identity(req).userId,
      validate(handleSchema, handle),
      validate(activeStateSchema, body).active,
    );
  }
  @Put('communities/:id/membership') membership(
    @Req() req: IdentityRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.feed.membership(
      identity(req).userId,
      uuid(id),
      validate(activeStateSchema, body).active,
    );
  }
  @Get('activity') activity(@Req() req: IdentityRequest) {
    return this.feed.activity(identity(req).userId);
  }
  @Post('activity/read') @HttpCode(200) read(
    @Req() req: IdentityRequest,
    @Body() body: unknown,
  ) {
    return this.feed.readActivity(
      identity(req).userId,
      validate(z.object({ ids: z.array(z.uuid()).max(20) }).strict(), body).ids,
    );
  }
  @Delete('posts/:id') remove(
    @Req() req: IdentityRequest,
    @Param('id') id: string,
  ) {
    return this.feed.remove(identity(req).userId, uuid(id));
  }
  @Post('posts/:id/restore') @HttpCode(200) restore(
    @Req() req: IdentityRequest,
    @Param('id') id: string,
  ) {
    return this.feed.remove(identity(req).userId, uuid(id), true);
  }
}
