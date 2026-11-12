import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Body,
  Req,
  Inject,
  UseGuards,
  HttpCode,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import type { Response } from 'express';
import {
  profileUpdateSchema,
  onboardingInputSchema,
  completeRegistrationSchema,
  deactivateAccountSchema,
} from '@circle/validation';
import { UsersService } from './users.service.js';
import {
  identity,
  IdentityGuard,
  type IdentityRequest,
} from './identity.guard.js';
import { validate } from '../core/http.js';
import { sessionCookieName } from '../auth/request-token.js';
@ApiTags('Identity')
@UseGuards(IdentityGuard)
@Controller('users/me')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  @Get() me(@Req() req: IdentityRequest) {
    return this.users.me(identity(req).userId);
  }
  @Get('communities')
  communities(@Req() req: IdentityRequest) {
    return this.users.communities(identity(req).userId);
  }
  @ApiBody({
    schema: z.toJSONSchema(completeRegistrationSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Post('complete')
  @HttpCode(200)
  complete(@Body() body: unknown, @Req() req: IdentityRequest) {
    const { communityIds, ...preferences } = validate(
      completeRegistrationSchema,
      body,
    );
    return this.users.completeOnboarding(
      identity(req).userId,
      preferences,
      communityIds,
    );
  }
  @ApiBody({
    schema: z.toJSONSchema(profileUpdateSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Patch()
  update(@Body() body: unknown, @Req() req: IdentityRequest) {
    return this.users.update(
      identity(req).userId,
      validate(profileUpdateSchema, body),
    );
  }
  @ApiBody({
    schema: z.toJSONSchema(onboardingInputSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Put('onboarding')
  completeOnboarding(@Body() body: unknown, @Req() req: IdentityRequest) {
    return this.users.completeOnboarding(
      identity(req).userId,
      validate(onboardingInputSchema, body),
    );
  }
  @ApiBody({
    schema: z.toJSONSchema(deactivateAccountSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Post('deactivate')
  @HttpCode(200)
  async deactivate(
    @Body() body: unknown,
    @Req() req: IdentityRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = identity(req);
    const { confirmation } = validate(deactivateAccountSchema, body);
    await this.users.deactivate(
      session.userId,
      session.user.handle,
      session.createdAt,
      confirmation,
    );
    res.clearCookie(sessionCookieName, {
      httpOnly: true,
      secure: sessionCookieName.startsWith('__Host-'),
      sameSite: 'strict',
      path: '/',
    });
    return { deactivated: true };
  }
}
