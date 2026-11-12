import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import request from 'supertest';
import { authenticator } from './authenticator.mjs';
if (
  process.env.NODE_ENV !== 'test' ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test') ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error('Identity tests require isolated test infrastructure');
const { createApplication } = await import('../dist/app.js');
const { DatabaseService } =
  await import('../dist/database/database.service.js');
const { CacheService } = await import('../dist/cache/cache.service.js');
const { AuthService } = await import('../dist/auth/auth.service.js');
const { environment } = await import('../dist/core/environment.js');
await test('identity vertical slice preserves authentication, ownership and communities', async (t) => {
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const db = app.get(DatabaseService);
  const cache = app.get(CacheService);
  const legacyHandle =
    'identity_' + randomUUID().replaceAll('-', '').slice(0, 20);
  const ids = [];
  const origin = 'http://localhost:3000';
  const agent = request.agent(server);
  const other = request.agent(server);
  const key = authenticator();
  let user;
  let otherUser;
  const post = (client, path, body) =>
    client
      .post('/v1/' + path)
      .set('Origin', origin)
      .send(body);
  const patch = (body) =>
    agent.patch('/v1/users/me').set('Origin', origin).send(body);
  const communities = await db.community.findMany({
    orderBy: { slug: 'asc' },
    select: { id: true, slug: true },
  });
  try {
    await t.test(
      'local mobile handoff cannot issue grants or sessions in production',
      async () => {
        const previous = environment.NODE_ENV;
        environment.NODE_ENV = 'production';
        try {
          const auth = app.get(AuthService);
          await assert.rejects(auth.authorizeMobile(undefined, 'unused'), {
            status: 401,
          });
          await assert.rejects(auth.exchangeMobile('unused', 'unused'), {
            status: 401,
          });
        } finally {
          environment.NODE_ENV = previous;
        }
      },
    );
    await t.test('anonymous profile access is rejected', async () => {
      await request(server).get('/v1/users/me').expect(401);
      await request(server)
        .patch('/v1/users/me')
        .set('Origin', origin)
        .send({ profileVersion: 0, bio: 'no' })
        .expect(401);
    });
    await t.test(
      'existing registration contract and identity relations remain supported',
      async () => {
        const options = await post(agent, 'auth/registration/options', {
          handle: legacyHandle,
        }).expect(201);
        await post(
          agent,
          'auth/registration/verify',
          key.register(options.body.data),
        ).expect(200);
        user = (await agent.get('/v1/users/me').expect(200)).body.data;
        ids.push(user.id);
        assert.equal(user.handle, legacyHandle);
        await agent
          .get('/v1/users/me')
          .set('Authorization', `Bearer ${'a'.repeat(43)}`)
          .expect(400);
        assert.equal(user.displayName, null);
        assert.equal(user.profileVersion, 0);
        assert.equal(user.avatarId, 'otter');
        assert.equal(user.onboardingCompletedAt, null);
        const relations = await db.user.findUniqueOrThrow({
          where: { id: user.id },
          include: { passkeys: true, sessions: true, auditEvents: true },
        });
        assert.equal(relations.passkeys.length, 1);
        assert.equal(relations.sessions.length, 1);
        assert.ok(relations.auditEvents.length >= 2);
      },
    );
    await t.test(
      'generated name_suffix handles recover from a real PostgreSQL uniqueness collision',
      async () => {
        const options = await post(
          other,
          'auth/registration/options',
          {},
        ).expect(201);
        assert.match(options.body.data.user.name, /^[a-z]+_[a-z]+_\d{4}$/);
        const cookies = options.headers['set-cookie'].find((c) =>
          c.startsWith('circle_registration='),
        );
        const challenge = cookies.split(';')[0].split('=')[1];
        const redisKey = 'challenge:registration:' + challenge;
        const pending = JSON.parse(await cache.client.get(redisKey));
        pending.handle = legacyHandle;
        await cache.client.set(redisKey, JSON.stringify(pending), 'KEEPTTL');
        const secondKey = authenticator();
        await post(
          other,
          'auth/registration/verify',
          secondKey.register(options.body.data),
        ).expect(200);
        otherUser = (await other.get('/v1/users/me').expect(200)).body.data;
        ids.push(otherUser.id);
        assert.match(otherUser.handle, /^[a-z]+_[a-z]+_\d{4}$/);
        assert.notEqual(user.id, otherUser.id);
        assert.notEqual(otherUser.handle, legacyHandle);
      },
    );
    await t.test(
      'profile validation rejects identity, ownership and unsafe appearance fields',
      async () => {
        for (const body of [
          { profileVersion: 0, handle: 'takeover' },
          { profileVersion: 0, id: otherUser.id },
          { profileVersion: 0, status: 'SUSPENDED' },
          {
            profileVersion: 0,
            onboardingCompletedAt: new Date().toISOString(),
          },
          { profileVersion: 0, avatarId: 'https://evil.example/a.svg' },
          { profileVersion: 0, bio: 'x'.repeat(281) },
          { profileVersion: 0, displayName: 'x'.repeat(51) },
          { profileVersion: 0, profileTheme: 'INVALID' },
          { profileVersion: 0, bio: 'bad\u0000text' },
          { profileVersion: 0 },
        ])
          await patch(body).expect(400);
        await agent
          .patch('/v1/users/me')
          .set('Origin', 'https://evil.example')
          .send({ profileVersion: 0, bio: 'no' })
          .expect(403);
      },
    );
    await t.test(
      'profile edits retain UUID, handle, passkeys and sessions',
      async () => {
        const r = await patch({
          profileVersion: 0,
          displayName: '  A quiet voice  ',
          bio: 'Hello, Circle.',
          avatarId: 'owl',
          profileTheme: 'DARK',
          profileAccent: 'TEAL',
        }).expect(200);
        user = r.body.data;
        assert.equal(user.id, ids[0]);
        assert.equal(user.handle, legacyHandle);
        await agent
          .get('/v1/users/me')
          .set('Authorization', `Bearer ${'a'.repeat(43)}`)
          .expect(400);
        assert.equal(user.displayName, 'A quiet voice');
        assert.equal(user.profileVersion, 1);
        assert.equal(user.profileTheme, 'DARK');
        assert.equal(await db.passkey.count({ where: { userId: user.id } }), 1);
        assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
        assert.equal(
          (await other.get('/v1/users/me').expect(200)).body.data.bio,
          null,
        );
        assert.equal(user.tokenHash, undefined);
        assert.equal(user.publicKey, undefined);
      },
    );
    await t.test(
      'simultaneous profile saves cannot silently overwrite each other',
      async () => {
        const results = await Promise.all([
          patch({ profileVersion: 1, bio: 'First edit' }),
          patch({ profileVersion: 1, bio: 'Second edit' }),
        ]);
        assert.deepEqual(
          results.map((r) => r.status).sort((a, b) => a - b),
          [200, 409],
        );
        const latest = (await agent.get('/v1/users/me').expect(200)).body.data;
        assert.equal(latest.profileVersion, 2);
        assert.ok(['First edit', 'Second edit'].includes(latest.bio));
      },
    );
    await t.test(
      'blank optional text is normalized and other fields preserved',
      async () => {
        const r = await patch({
          profileVersion: 2,
          displayName: ' ',
          bio: null,
        }).expect(200);
        assert.equal(r.body.data.displayName, null);
        assert.equal(r.body.data.bio, null);
        assert.equal(r.body.data.avatarId, 'owl');
      },
    );
    await t.test(
      'device session listing identifies current session without token disclosure',
      async () => {
        const r = await agent.get('/v1/auth/sessions').expect(200);
        assert.equal(r.body.data.filter((s) => s.current).length, 1);
        assert.equal(r.body.data[0].tokenHash, undefined);
      },
    );
    await t.test(
      'mobile handoff is PKCE-bound, single-use, and shares identity authorization',
      async () => {
        const verifier = randomBytes(32).toString('base64url');
        const challenge = createHash('sha256')
          .update(verifier)
          .digest('base64url');
        await request(server)
          .post('/v1/auth/mobile/authorize')
          .set('Origin', origin)
          .send({ challenge })
          .expect(401);
        const granted = await post(agent, 'auth/mobile/authorize', {
          challenge,
        }).expect(200);
        const { code } = granted.body.data;
        assert.equal(granted.body.data.token, undefined);
        await post(request(server), 'auth/mobile/exchange', {
          code,
          verifier: randomBytes(32).toString('base64url'),
        }).expect(401);
        const exchange = await post(request(server), 'auth/mobile/exchange', {
          code,
          verifier,
        }).expect(200);
        assert.equal(exchange.headers['set-cookie'], undefined);
        const token = exchange.body.data.token;
        const mobile = await request(server)
          .get('/v1/users/me')
          .set('Authorization', 'Bearer ' + token)
          .expect(200);
        assert.equal(mobile.body.data.id, user.id);
        await post(request(server), 'auth/mobile/exchange', {
          code,
          verifier,
        }).expect(401);
        await request(server)
          .patch('/v1/users/me')
          .set('Authorization', 'Bearer ' + token)
          .send({ profileVersion: 3, bio: 'Mobile edit' })
          .expect(403);
        await request(server)
          .patch('/v1/users/me')
          .set('Authorization', 'Bearer ' + token)
          .set('Origin', origin)
          .send({ profileVersion: 3, bio: 'Mobile edit' })
          .expect(200);
        const next = await post(agent, 'auth/mobile/authorize', {
          challenge,
        }).expect(200);
        const races = await Promise.all([
          post(request(server), 'auth/mobile/exchange', {
            code: next.body.data.code,
            verifier,
          }),
          post(request(server), 'auth/mobile/exchange', {
            code: next.body.data.code,
            verifier,
          }),
        ]);
        assert.deepEqual(
          races.map((r) => r.status).sort((a, b) => a - b),
          [200, 401],
        );
        const expired = await post(agent, 'auth/mobile/authorize', {
          challenge,
        }).expect(200);
        await cache.client.pexpire(
          'mobile-grant:' +
            createHash('sha256').update(expired.body.data.code).digest('hex'),
          1,
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
        await post(request(server), 'auth/mobile/exchange', {
          code: expired.body.data.code,
          verifier,
        }).expect(401);
        const source = (
          await agent.get('/v1/auth/sessions').expect(200)
        ).body.data.find((s) => s.current);
        const revoked = await post(agent, 'auth/mobile/authorize', {
          challenge,
        }).expect(200);
        await db.session.update({
          where: { id: source.id },
          data: { revokedAt: new Date() },
        });
        await post(request(server), 'auth/mobile/exchange', {
          code: revoked.body.data.code,
          verifier,
        }).expect(401);
        await db.session.update({
          where: { id: source.id },
          data: { revokedAt: null },
        });
      },
    );
    await t.test(
      'logout-all racing a mobile exchange leaves no usable session',
      async () => {
        const record = await db.user.create({
          data: { handle: 'race_' + randomBytes(12).toString('hex') },
        });
        ids.push(record.id);
        const token = randomBytes(32).toString('base64url');
        await db.session.create({
          data: {
            userId: record.id,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + 60000),
          },
        });
        const auth = app.get(AuthService);
        const verifier = randomBytes(32).toString('base64url');
        const challenge = createHash('sha256')
          .update(verifier)
          .digest('base64url');
        const { code } = await auth.authorizeMobile(token, challenge);
        const [revocation, exchange] = await Promise.allSettled([
          auth.revoke(token),
          auth.exchangeMobile(code, verifier),
        ]);
        assert.equal(revocation.status, 'fulfilled');
        if (exchange.status === 'fulfilled')
          await assert.rejects(auth.session(exchange.value.token), {
            status: 401,
          });
        else assert.equal(exchange.reason.status, 401);
        assert.equal(
          await db.session.count({
            where: { userId: record.id, revokedAt: null },
          }),
          0,
        );
      },
    );
    await t.test(
      'deactivation requires exact confirmation and recent authentication',
      async () => {
        await post(agent, 'users/me/deactivate', {
          confirmation: 'wrong_handle',
        }).expect(403);
        const current = (
          await agent.get('/v1/auth/sessions').expect(200)
        ).body.data.find((s) => s.current);
        const session = await db.session.findUniqueOrThrow({
          where: { id: current.id },
        });
        await db.session.update({
          where: { id: session.id },
          data: { createdAt: new Date(Date.now() - 301000) },
        });
        await post(agent, 'users/me/deactivate', {
          confirmation: legacyHandle,
        }).expect(403);
        await db.session.update({
          where: { id: session.id },
          data: { createdAt: new Date() },
        });
      },
    );
    await t.test(
      'concurrent login and deactivation leave no usable session',
      async () => {
        const loginAgent = request.agent(server);
        const options = await post(
          loginAgent,
          'auth/authentication/options',
          {},
        ).expect(201);
        const response = key.authenticate(options.body.data, { counter: 1 });
        const [deactivated, login] = await Promise.all([
          post(agent, 'users/me/deactivate', { confirmation: legacyHandle }),
          post(loginAgent, 'auth/authentication/verify', response),
        ]);
        assert.equal(deactivated.status, 200);
        assert.ok([200, 401].includes(login.status));
        await agent.get('/v1/users/me').expect(401);
        await loginAgent.get('/v1/users/me').expect(401);
        const record = await db.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        assert.equal(record.status, 'DEACTIVATED');
        assert.equal(record.handle, legacyHandle);
        assert.equal(
          await db.session.count({
            where: { userId: user.id, revokedAt: null },
          }),
          0,
        );
        assert.equal(await db.passkey.count({ where: { userId: user.id } }), 1);
        await other.get('/v1/users/me').expect(200);
        assert.deepEqual(
          await db.community.findMany({
            orderBy: { slug: 'asc' },
            select: { id: true, slug: true },
          }),
          communities,
        );
      },
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
