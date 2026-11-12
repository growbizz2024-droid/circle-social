import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Res,
  Inject,
  HttpCode,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import {
  registrationCredentialSchema,
  authenticationCredentialSchema,
} from './credential-schemas.js';
import type { UserSummary } from '@circle/shared-types';
import {
  registrationOptionsSchema,
  recoveryCodeSchema,
} from '@circle/validation';
import { requestToken } from './request-token.js';
import { GeoIpService } from '../location/geoip.service.js';
import { AuthService } from './auth.service.js';
import { CacheService } from '../cache/cache.service.js';
import { DatabaseService } from '../database/database.service.js';
import { environment } from '../core/environment.js';
import { validate } from '../core/http.js';
export const sessionCookie =
  environment.NODE_ENV === 'production'
    ? '__Host-circle_session'
    : 'circle_session';
const challengeCookie = (kind: string) =>
  environment.NODE_ENV === 'production'
    ? `__Host-circle_${kind}`
    : `circle_${kind}`;
const cookieOptions = {
  httpOnly: true,
  secure:
    environment.NODE_ENV === 'production' ||
    new URL(environment.WEB_ORIGIN).protocol === 'https:',
  sameSite: 'strict' as const,
  path: '/',
};
function cookie(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
}
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GeoIpService) private readonly geoip: GeoIpService,
    @Inject(CacheService) private readonly cache: CacheService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}
  private async protect(req: Request): Promise<void> {
    if (req.headers.origin !== environment.WEB_ORIGIN)
      throw new ForbiddenException();
    if (
      !(await this.cache.rateLimit(
        `auth:${req.ip}`,
        environment.AUTH_RATE_LIMIT,
        60,
      ))
    )
      throw new HttpException('Too many requests', 429);
  }
  private setSession(
    res: Response,
    result: { token: string; expiresAt: Date },
  ) {
    res.cookie(sessionCookie, result.token, {
      ...cookieOptions,
      expires: result.expiresAt,
    });
    return { authenticated: true };
  }
  @ApiBody({
    schema: z.toJSONSchema(registrationOptionsSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Post('registration/options')
  async registrationOptions(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.protect(req);
    const { handle, intent, avatar } = validate(
      registrationOptionsSchema,
      body,
    );
    const result = await this.auth.options(
      handle,
      requestToken(req),
      intent,
      avatar,
    );
    res.cookie(challengeCookie('registration'), result.id, {
      ...cookieOptions,
      maxAge: 300000,
    });
    return result.options;
  }
  @ApiBody({
    schema: z.toJSONSchema(registrationCredentialSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Post('registration/verify')
  @HttpCode(200)
  async registrationVerify(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.protect(req);
    const response = validate(
      registrationCredentialSchema,
      body,
    ) as unknown as RegistrationResponseJSON;
    const result = await this.auth.registration(
      cookie(req, challengeCookie('registration')),
      response,
      requestToken(req),
      this.geoip.fromRequest(req),
    );
    res.clearCookie(challengeCookie('registration'), cookieOptions);
    return this.setSession(res, result);
  }
  @Get('recovery/status')
  recoveryStatus(@Req() req: Request) {
    return this.auth.recoveryStatus(requestToken(req));
  }
  @Post('recovery/issue')
  async issueRecovery(@Req() req: Request) {
    await this.protect(req);
    return this.auth.issueRecovery(requestToken(req));
  }
  @ApiBody({
    schema: z.toJSONSchema(recoveryCodeSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Post('recovery/confirm')
  @HttpCode(200)
  async confirmRecovery(@Body() body: unknown, @Req() req: Request) {
    await this.protect(req);
    return this.auth.confirmRecovery(
      validate(recoveryCodeSchema, body).code,
      requestToken(req),
    );
  }
  @ApiBody({
    schema: z.toJSONSchema(recoveryCodeSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Post('recovery/options')
  async recoveryOptions(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.protect(req);
    const result = await this.auth.recoveryOptions(
      validate(recoveryCodeSchema, body).code,
      requestToken(req),
    );
    res.cookie(challengeCookie('recovery'), result.id, {
      ...cookieOptions,
      maxAge: 300000,
    });
    return result.options;
  }
  @ApiBody({
    schema: z.toJSONSchema(registrationCredentialSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Post('recovery/verify')
  @HttpCode(200)
  async recoveryVerify(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.protect(req);
    const response = validate(
      registrationCredentialSchema,
      body,
    ) as unknown as RegistrationResponseJSON;
    const result = await this.auth.registration(
      cookie(req, challengeCookie('recovery')),
      response,
      undefined,
      this.geoip.fromRequest(req),
    );
    res.clearCookie(challengeCookie('recovery'), cookieOptions);
    return this.setSession(res, result);
  }
  @Post('authentication/options') async authenticationOptions(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.protect(req);
    const result = await this.auth.loginOptions();
    res.cookie(challengeCookie('authentication'), result.id, {
      ...cookieOptions,
      maxAge: 300000,
    });
    return result.options;
  }
  @ApiBody({
    schema: z.toJSONSchema(authenticationCredentialSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @Post('authentication/verify')
  @HttpCode(200)
  async authenticationVerify(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.protect(req);
    const response = validate(
      authenticationCredentialSchema,
      body,
    ) as unknown as AuthenticationResponseJSON;
    const result = await this.auth.login(
      cookie(req, challengeCookie('authentication')),
      response,
      this.geoip.fromRequest(req),
    );
    res.clearCookie(challengeCookie('authentication'), cookieOptions);
    return this.setSession(res, result);
  }
  @Post('mobile/authorize') @HttpCode(200) async authorizeMobile(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    await this.protect(req);
    if (req.headers.authorization) throw new ForbiddenException();
    const { challenge } = validate(
      z.object({ challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
      body,
    );
    return this.auth.authorizeMobile(cookie(req, sessionCookie), challenge);
  }
  @Post('mobile/exchange') @HttpCode(200) async exchangeMobile(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    await this.protect(req);
    const { code, verifier } = validate(
      z
        .object({
          code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          verifier: z
            .string()
            .min(43)
            .max(128)
            .regex(/^[A-Za-z0-9._~-]+$/),
        })
        .strict(),
      body,
    );
    return this.auth.exchangeMobile(
      code,
      verifier,
      this.geoip.fromRequest(req),
    );
  }
  @Get('me') async me(@Req() req: Request): Promise<UserSummary> {
    const { user } = await this.auth.session(requestToken(req));
    return { id: user.id, handle: user.handle, status: user.status };
  }
  @Get('passkeys') async passkeys(@Req() req: Request) {
    const session = await this.auth.session(requestToken(req));
    return this.db.passkey.findMany({
      where: { userId: session.userId },
      select: {
        id: true,
        createdAt: true,
        deviceType: true,
        backedUp: true,
        transports: true,
      },
    });
  }
  @Delete('passkeys/:id') async removePasskey(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    await this.protect(req);
    const session = await this.auth.session(requestToken(req));
    if (Date.now() - session.createdAt.getTime() > 300000)
      throw new ForbiddenException();
    validate(z.string().min(1).max(2048), id);
    await this.db.$transaction(
      async (tx) => {
        if (
          (await tx.passkey.count({ where: { userId: session.userId } })) <= 1
        )
          throw new ForbiddenException();
        await tx.passkey.deleteMany({ where: { id, userId: session.userId } });
        await tx.auditEvent.create({
          data: { userId: session.userId, kind: 'passkey.removed' },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    return { removed: true };
  }
  @Get('sessions') async sessions(@Req() req: Request) {
    const session = await this.auth.session(requestToken(req));
    const sessions = await this.db.session.findMany({
      where: {
        userId: session.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        locationCity: true,
        locationCountry: true,
        locationCountryCode: true,
      },
    });
    return sessions.map(
      ({ locationCity, locationCountry, locationCountryCode, ...s }) => ({
        ...s,
        current: s.id === session.id,
        location:
          locationCountry && locationCountryCode
            ? {
                city: locationCity,
                country: locationCountry,
                countryCode: locationCountryCode,
                approximate: true,
              }
            : null,
      }),
    );
  }
  @Delete('sessions/:id') async revoke(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    await this.protect(req);
    validate(z.uuid(), id);
    await this.auth.revoke(requestToken(req), id);
    return { revoked: true };
  }
  @Post('logout') @HttpCode(200) async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.protect(req);
    const current = await this.auth.session(requestToken(req));
    await this.auth.revoke(requestToken(req), current.id);
    res.clearCookie(sessionCookie, cookieOptions);
    return { revoked: true };
  }
  @Post('logout-all') @HttpCode(200) async logoutAll(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.protect(req);
    await this.auth.revoke(requestToken(req));
    res.clearCookie(sessionCookie, cookieOptions);
    return { revoked: true };
  }
}
