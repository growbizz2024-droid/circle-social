import { generateAvatar } from '@circle/avatar-engine';
import type { AvatarSpec } from '@circle/shared-types';
import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';
import { environment } from '../core/environment.js';
import { generateHandle } from '../users/handle.js';
import type { LoginLocation } from '@circle/shared-types';
import { hashToken } from './tokens.js';
interface Pending {
  avatar?: AvatarSpec;
  challenge: string;
  handle?: string;
  userId?: string;
  sessionId?: string;
  generatedHandle?: boolean;
  recoveryId?: string;
  recoveryHash?: string;
}
@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CacheService) private readonly cache: CacheService,
  ) {}
  async recoveryStatus(token?: string) {
    const session = await this.session(token);
    const current = await this.db.recoveryCredential.findFirst({
      where: {
        userId: session.userId,
        confirmedAt: { not: null },
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      confirmed: !!current,
      expiresAt: current?.expiresAt.toISOString() ?? null,
    };
  }
  async issueRecovery(token?: string) {
    const session = await this.session(token);
    if (Date.now() - session.createdAt.getTime() > 300000)
      throw new UnauthorizedException('Sign in again before changing recovery');
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const code = `CS1.${id}.${secret}`;
    const expiresAt = new Date(Date.now() + 365 * 86400000);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.userId}::uuid FOR UPDATE`;
      const live = await tx.session.findFirst({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: 'ACTIVE' },
        },
      });
      if (!live) throw new UnauthorizedException();
      await tx.recoveryCredential.updateMany({
        where: { userId: session.userId, confirmedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.recoveryCredential.create({
        data: {
          id,
          userId: session.userId,
          verifier: hashToken('circle-recovery:' + code),
          expiresAt,
        },
      });
      await tx.auditEvent.create({
        data: { userId: session.userId, kind: 'recovery.issued' },
      });
    });
    return { code, expiresAt: expiresAt.toISOString() };
  }
  private async recoveryRecord(code: string) {
    const id = code.split('.')[1];
    const row = await this.db.recoveryCredential.findUnique({
      where: { id },
      include: { user: true },
    });
    const expected = Buffer.from(row?.verifier ?? '0'.repeat(64), 'hex');
    const actual = Buffer.from(hashToken('circle-recovery:' + code), 'hex');
    if (
      !timingSafeEqual(expected, actual) ||
      !row ||
      row.usedAt ||
      row.revokedAt ||
      row.expiresAt <= new Date() ||
      row.user.status !== 'ACTIVE'
    )
      throw new UnauthorizedException('Recovery could not be verified');
    return row;
  }
  async confirmRecovery(code: string, token?: string) {
    const session = await this.session(token);
    if (Date.now() - session.createdAt.getTime() > 300000)
      throw new UnauthorizedException('Sign in again before changing recovery');
    const row = await this.recoveryRecord(code);
    if (row.userId !== session.userId) throw new UnauthorizedException();
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.userId}::uuid FOR UPDATE`;
      const live = await tx.session.findFirst({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { status: 'ACTIVE' },
        },
      });
      if (!live) throw new UnauthorizedException();
      const confirmed = await tx.recoveryCredential.updateMany({
        where: {
          id: row.id,
          userId: session.userId,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { confirmedAt: new Date() },
      });
      if (confirmed.count !== 1) throw new UnauthorizedException();
      await tx.recoveryCredential.updateMany({
        where: { userId: session.userId, id: { not: row.id }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: { userId: session.userId, kind: 'recovery.confirmed' },
      });
    });
    return { confirmed: true };
  }
  async recoveryOptions(code: string, token?: string) {
    if (token) {
      try {
        await this.session(token);
        throw new ConflictException('Sign out before recovering an account');
      } catch (e) {
        if (!(e instanceof UnauthorizedException)) throw e;
      }
    }
    const row = await this.recoveryRecord(code);
    if (!row.confirmedAt)
      throw new UnauthorizedException('Recovery could not be verified');
    const options = await generateRegistrationOptions({
      rpName: 'Circle.social',
      rpID: environment.WEBAUTHN_RP_ID,
      userName: row.user.handle,
      userID: new TextEncoder().encode(row.userId),
      attestationType: 'none',
      supportedAlgorithmIDs: [-7, -257],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      excludeCredentials: (
        await this.db.passkey.findMany({
          where: { userId: row.userId },
          select: { id: true },
        })
      ).map((x) => ({ id: x.id })),
    });
    const id = randomBytes(32).toString('base64url');
    await this.cache.client.set(
      `challenge:registration:${id}`,
      JSON.stringify({
        challenge: options.challenge,
        userId: row.userId,
        handle: row.user.handle,
        recoveryId: row.id,
        recoveryHash: row.verifier,
      }),
      'EX',
      300,
    );
    return { id, options };
  }

  async audit(kind: string, userId?: string): Promise<void> {
    await this.db.auditEvent.create({ data: { kind, userId } });
  }
  async session(token: string | undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    )
      throw new UnauthorizedException();
    return session;
  }
  async options(
    requestedHandle?: string,
    sessionToken?: string,
    intent?: 'create' | 'add',
    avatar?: AvatarSpec,
  ) {
    let existingSession: Awaited<ReturnType<AuthService['session']>> | null =
      null;
    if (sessionToken) {
      try {
        existingSession = await this.session(sessionToken);
      } catch (e) {
        if (intent !== 'create' || !(e instanceof UnauthorizedException))
          throw e;
      }
    }
    if (intent === 'create' && existingSession)
      throw new ConflictException('Another identity is signed in');
    if (intent === 'add' && !existingSession) throw new UnauthorizedException();
    if (
      existingSession &&
      Date.now() - existingSession.createdAt.getTime() > 300000
    )
      throw new UnauthorizedException();
    if (
      existingSession &&
      requestedHandle &&
      requestedHandle !== existingSession.user.handle
    )
      throw new ConflictException('Another identity is signed in');
    const handle =
      existingSession?.user.handle ?? requestedHandle ?? generateHandle();
    const userId = existingSession?.userId ?? randomUUID();
    if (
      !existingSession &&
      requestedHandle &&
      (await this.db.user.findUnique({ where: { handle } }))
    )
      throw new ConflictException();
    const credentials = existingSession
      ? await this.db.passkey.findMany({ where: { userId } })
      : [];
    const options = await generateRegistrationOptions({
      rpName: 'Circle.social',
      rpID: environment.WEBAUTHN_RP_ID,
      userName: existingSession?.user.handle ?? handle,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      supportedAlgorithmIDs: [-7, -257],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      excludeCredentials: credentials.map((c) => ({ id: c.id })),
    });
    const id = randomBytes(32).toString('base64url');
    await this.cache.client.set(
      `challenge:registration:${id}`,
      JSON.stringify({
        challenge: options.challenge,
        userId,
        handle,
        sessionId: existingSession?.id,
        generatedHandle: !existingSession && !requestedHandle,
        ...(!existingSession
          ? { avatar: avatar ?? generateAvatar(randomUUID()) }
          : {}),
      }),
      'EX',
      300,
    );
    return { id, options };
  }
  async registration(
    id: string | undefined,
    response: RegistrationResponseJSON,
    sessionToken?: string,
    location: LoginLocation | null = null,
  ) {
    const raw = id
      ? await this.cache.take(`challenge:registration:${id}`)
      : null;
    if (!raw) throw new UnauthorizedException();
    const pending = JSON.parse(raw) as Pending;
    if (!pending.userId || !pending.handle) throw new UnauthorizedException();
    if (
      pending.sessionId &&
      (await this.session(sessionToken)).id !== pending.sessionId
    )
      throw new UnauthorizedException();
    let verified;
    try {
      verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: environment.WEB_ORIGIN,
        expectedRPID: environment.WEBAUTHN_RP_ID,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      });
    } catch {
      await this.audit('passkey.registration.rejected');
      throw new UnauthorizedException();
    }
    if (!verified.verified) throw new UnauthorizedException();
    const info = verified.registrationInfo;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await this.db.$transaction(async (tx) => {
          if (pending.recoveryId) {
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${pending.userId}::uuid FOR UPDATE`;
            const consumed = await tx.recoveryCredential.updateMany({
              where: {
                id: pending.recoveryId,
                userId: pending.userId,
                verifier: pending.recoveryHash,
                confirmedAt: { not: null },
                usedAt: null,
                revokedAt: null,
                expiresAt: { gt: new Date() },
                user: { status: 'ACTIVE' },
              },
              data: { usedAt: new Date() },
            });
            if (consumed.count !== 1)
              throw new UnauthorizedException('Recovery could not be verified');
            await tx.session.updateMany({
              where: { userId: pending.userId, revokedAt: null },
              data: {
                revokedAt: new Date(),
                locationCity: null,
                locationCountry: null,
                locationCountryCode: null,
              },
            });
            await tx.auditEvent.create({
              data: { userId: pending.userId, kind: 'recovery.redeemed' },
            });
          }
          if (!pending.sessionId && !pending.recoveryId)
            await tx.user.create({
              data: {
                id: pending.userId!,
                handle: pending.handle!,
                avatar: {
                  create: {
                    seed: (pending.avatar ?? generateAvatar(pending.userId!))
                      .seed,
                    defaultSeed: (
                      pending.avatar ?? generateAvatar(pending.userId!)
                    ).seed,
                    version: 1,
                    config: JSON.parse(
                      JSON.stringify(
                        (pending.avatar ?? generateAvatar(pending.userId!))
                          .config,
                      ),
                    ),
                  },
                },
              },
            });
          await tx.passkey.create({
            data: {
              id: info.credential.id,
              userId: pending.userId!,
              publicKey: Buffer.from(info.credential.publicKey),
              counter: BigInt(info.credential.counter),
              transports: info.credential.transports ?? [],
              deviceType: info.credentialDeviceType,
              backedUp: info.credentialBackedUp,
            },
          });
          await tx.auditEvent.create({
            data: { userId: pending.userId!, kind: 'passkey.registered' },
          });
        });
        break;
      } catch (error) {
        const duplicate = error as {
          code?: string;
          meta?: { target?: string[] };
        };
        if (
          duplicate.code === 'P2002' &&
          pending.generatedHandle &&
          attempt < 7 &&
          (await this.db.user.findUnique({ where: { handle: pending.handle } }))
        ) {
          pending.handle = generateHandle();
          continue;
        }
        if (duplicate.code === 'P2002') throw new ConflictException();
        throw error;
      }
    }
    return this.newSession(pending.userId, undefined, location);
  }
  async loginOptions() {
    const options = await generateAuthenticationOptions({
      rpID: environment.WEBAUTHN_RP_ID,
      userVerification: 'required',
    });
    const id = randomBytes(32).toString('base64url');
    await this.cache.client.set(
      `challenge:authentication:${id}`,
      JSON.stringify({ challenge: options.challenge }),
      'EX',
      300,
    );
    return { id, options };
  }
  async login(
    id: string | undefined,
    response: AuthenticationResponseJSON,
    location: LoginLocation | null = null,
  ) {
    const raw = id
      ? await this.cache.take(`challenge:authentication:${id}`)
      : null;
    if (!raw) throw new UnauthorizedException();
    const pending = JSON.parse(raw) as Pending;
    const credential = await this.db.passkey.findUnique({
      where: { id: response.id },
      include: { user: true },
    });
    if (!credential || credential.user.status !== 'ACTIVE')
      throw new UnauthorizedException();
    if (
      response.response.userHandle !==
      Buffer.from(credential.userId).toString('base64url')
    )
      throw new UnauthorizedException();
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: environment.WEB_ORIGIN,
        expectedRPID: environment.WEBAUTHN_RP_ID,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.publicKey),
          counter: Number(credential.counter),
        },
      });
    } catch {
      await this.audit('passkey.authentication.rejected', credential.userId);
      throw new UnauthorizedException();
    }
    if (!result.verified) throw new UnauthorizedException();
    // Compare-and-swap protects against parallel assertions overwriting counters.
    const updated = await this.db.passkey.updateMany({
      where: { id: credential.id, counter: credential.counter },
      data: {
        counter: BigInt(result.authenticationInfo.newCounter),
        backedUp: result.authenticationInfo.credentialBackedUp,
      },
    });
    if (updated.count !== 1) throw new UnauthorizedException();
    return this.newSession(credential.userId, undefined, location);
  }
  async authorizeMobile(token: string | undefined, challenge: string) {
    if (environment.NODE_ENV === 'production')
      throw new UnauthorizedException();
    const session = await this.session(token);
    if (Date.now() - session.createdAt.getTime() > 300000)
      throw new UnauthorizedException();
    const code = randomBytes(32).toString('base64url');
    await this.cache.client.set(
      `mobile-grant:${hashToken(code)}`,
      JSON.stringify({
        userId: session.userId,
        sessionId: session.id,
        challenge,
      }),
      'EX',
      30,
    );
    return { code };
  }
  async exchangeMobile(
    code: string,
    verifier: string,
    location: LoginLocation | null = null,
  ) {
    if (environment.NODE_ENV === 'production')
      throw new UnauthorizedException();
    const key = `mobile-grant:${hashToken(code)}`;
    const raw = await this.cache.client.get(key);
    if (!raw) throw new UnauthorizedException();
    const grant = JSON.parse(raw) as {
      userId: string;
      sessionId: string;
      challenge: string;
    };
    if (
      hashToken(verifier) !==
      Buffer.from(grant.challenge, 'base64url').toString('hex')
    )
      throw new UnauthorizedException();
    if ((await this.cache.take(key)) !== raw) throw new UnauthorizedException();
    return this.newSession(grant.userId, grant.sessionId, location);
  }
  private async newSession(
    userId: string,
    sourceSessionId?: string,
    location: LoginLocation | null = null,
  ) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + environment.SESSION_TTL_SECONDS * 1000,
    );
    await this.db.$transaction(async (tx) => {
      // Serialize session issuance with account deactivation on the user row.
      const users = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE id=${userId}::uuid AND status='ACTIVE' FOR NO KEY UPDATE`;
      if (!users.length) throw new UnauthorizedException();
      if (sourceSessionId) {
        const source = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM sessions WHERE id=${sourceSessionId}::uuid AND "userId"=${userId}::uuid AND "revokedAt" IS NULL AND "expiresAt">now() FOR UPDATE`;
        if (!source.length) throw new UnauthorizedException();
      }
      await tx.session.create({
        data: {
          userId,
          tokenHash: hashToken(token),
          expiresAt,
          locationCity: location?.city ?? null,
          locationCountry: location?.country ?? null,
          locationCountryCode: location?.countryCode ?? null,
        },
      });
      await tx.auditEvent.create({ data: { userId, kind: 'session.created' } });
    });
    return { token, expiresAt };
  }
  async revoke(token: string | undefined, sessionId?: string): Promise<void> {
    const session = await this.session(token);
    await this.db.$transaction(async (tx) => {
      // Use the same lock order as handoff issuance so logout-all includes any
      // session committed by an exchange that wins the race.
      await tx.$queryRaw`SELECT id FROM users WHERE id=${session.userId}::uuid FOR NO KEY UPDATE`;
      await tx.session.updateMany({
        where: {
          userId: session.userId,
          ...(sessionId ? { id: sessionId } : {}),
        },
        data: {
          revokedAt: new Date(),
          locationCity: null,
          locationCountry: null,
          locationCountryCode: null,
        },
      });
      await tx.auditEvent.create({
        data: { userId: session.userId, kind: 'session.revoked' },
      });
    });
  }
}
