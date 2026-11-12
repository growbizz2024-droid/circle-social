import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  Inject,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { z } from 'zod';
import { ONBOARDING_BACKGROUNDS } from '@circle/constants';
import { themeDraftSchema, themeUpdateSchema } from '@circle/validation';
import {
  IdentityGuard,
  identity,
  type IdentityRequest,
} from '../users/identity.guard.js';
import { validate } from '../core/http.js';
import { ThemesService } from './themes.service.js';
const id = (v: string) => validate(z.uuid(), v),
  version = z.number().int().min(0).max(2147483646),
  revisionSchema = z.object({ revision: version }).strict();
@Controller('themes')
@UseGuards(IdentityGuard)
export class ThemesController {
  constructor(@Inject(ThemesService) private readonly themes: ThemesService) {}
  @Get() list(@Req() r: IdentityRequest) {
    return this.themes.list(identity(r).userId);
  }
  @Get('state') state(@Req() r: IdentityRequest) {
    return this.themes.state(identity(r).userId);
  }
  @Post() create(@Req() r: IdentityRequest, @Body() b: unknown) {
    return this.themes.create(
      identity(r).userId,
      validate(themeDraftSchema, b),
    );
  }
  @Patch(':id') update(
    @Req() r: IdentityRequest,
    @Param('id') v: string,
    @Body() b: unknown,
  ) {
    return this.themes.update(
      identity(r).userId,
      id(v),
      validate(themeUpdateSchema, b),
    );
  }
  @Post('default') @HttpCode(200) defaults(
    @Req() r: IdentityRequest,
    @Body() b: unknown,
  ) {
    const body = validate(
      z
        .object({
          themeVersion: version,
          backgroundId: z.enum(ONBOARDING_BACKGROUNDS.map((x) => x.id)),
        })
        .strict(),
      b,
    );
    return this.themes.defaults(
      identity(r).userId,
      body.themeVersion,
      body.backgroundId,
    );
  }
  @Post(':id/duplicate') duplicate(
    @Req() r: IdentityRequest,
    @Param('id') v: string,
    @Body() b: unknown,
  ) {
    validate(z.object({}).strict(), b);
    return this.themes.duplicate(identity(r).userId, id(v));
  }
  @Post(':id/apply') @HttpCode(200) apply(
    @Req() r: IdentityRequest,
    @Param('id') v: string,
    @Body() b: unknown,
  ) {
    return this.themes.apply(
      identity(r).userId,
      id(v),
      validate(z.object({ themeVersion: version }).strict(), b).themeVersion,
    );
  }
  @Delete(':id') remove(
    @Req() r: IdentityRequest,
    @Param('id') v: string,
    @Body() b: unknown,
  ) {
    return this.themes.remove(
      identity(r).userId,
      id(v),
      validate(revisionSchema, b).revision,
    );
  }
  @Post(':id/restore') @HttpCode(200) restore(
    @Req() r: IdentityRequest,
    @Param('id') v: string,
    @Body() b: unknown,
  ) {
    return this.themes.remove(
      identity(r).userId,
      id(v),
      validate(revisionSchema, b).revision,
      true,
    );
  }
}
