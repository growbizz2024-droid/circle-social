import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import request from 'supertest';
import { authenticator } from './authenticator.mjs';
if (
  process.env.NODE_ENV !== 'test' ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test') ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error('Onboarding tests require isolated infrastructure');
process.env.AUTH_RATE_LIMIT = '500';
const { createApplication } = await import('../dist/app.js');
const { DatabaseService } =
  await import('../dist/database/database.service.js');
await test('onboarding is private, authenticated, atomic and preserves existing identities', async (t) => {
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const db = app.get(DatabaseService);
  const ids = [];
  const origin = 'http://localhost:3000';
  const agent = request.agent(server);
  const other = request.agent(server);
  const post = (client, path, body) =>
    client
      .post('/v1/' + path)
      .set('Origin', origin)
      .send(body);
  const put = (client, body) =>
    client.put('/v1/users/me/onboarding').set('Origin', origin).send(body);
  const base = {
    gender: null,
    vibe: 'CALM',
    backgroundId: 'clouds',
    interests: ['technology', 'books'],
  };
  const communities = await db.community.findMany({
    orderBy: { slug: 'asc' },
    select: { id: true, slug: true },
  });
  let user, otherUser, completedAt;
  async function register(client, handle) {
    const key = authenticator();
    const options = await post(client, 'auth/registration/options', {
      handle,
      intent: 'create',
    }).expect(201);
    assert.equal(await db.user.findUnique({ where: { handle } }), null);
    await post(
      client,
      'auth/registration/verify',
      key.register(options.body.data),
    ).expect(200);
    const p = (await client.get('/v1/users/me').expect(200)).body.data;
    ids.push(p.id);
    return p;
  }
  try {
    await t.test(
      'no account or preferences are written before verified registration',
      async () => {
        user = await register(
          agent,
          'onboard_' + randomUUID().replaceAll('-', '').slice(0, 20),
        );
        otherUser = await register(
          other,
          'other_' + randomUUID().replaceAll('-', '').slice(0, 20),
        );
        assert.equal(user.onboarding, null);
        assert.equal(user.onboardingCompletedAt, null);
      },
    );
    await t.test(
      'anonymous completion and cross-origin completion are rejected',
      async () => {
        await put(request(server), { ...base, profileVersion: 0 }).expect(401);
        await agent
          .put('/v1/users/me/onboarding')
          .set('Origin', 'https://evil.example')
          .send({ ...base, profileVersion: 0 })
          .expect(403);
      },
    );
    await t.test(
      'unknown fields, arbitrary assets, duplicate and unknown interests are rejected without writes',
      async () => {
        for (const body of [
          { ...base, profileVersion: 0, userId: otherUser.id },
          { ...base, profileVersion: 0, handle: 'replace_handle' },
          {
            ...base,
            profileVersion: 0,
            backgroundId: 'https://evil.example/image',
          },
          {
            ...base,
            profileVersion: 0,
            interests: ['technology', 'technology'],
          },
          { ...base, profileVersion: 0, interests: ['unknown'] },
          { ...base, profileVersion: 0, gender: 'unknown' },
        ])
          await put(agent, body).expect(400);
        assert.equal(
          await db.userOnboarding.count({ where: { userId: user.id } }),
          0,
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
            .onboardingCompletedAt,
          null,
        );
      },
    );
    await t.test(
      'completion atomically saves private choices and the chosen theme without changing authentication',
      async () => {
        const sessions = await db.session.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
        const keys = await db.passkey.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
        const recovery = (
          await post(agent, 'auth/recovery/issue', {}).expect(201)
        ).body.data;
        await post(agent, 'auth/recovery/confirm', {
          code: recovery.code,
        }).expect(200);
        const p = (
          await agent
            .post('/v1/users/me/complete')
            .set('Origin', origin)
            .send({ ...base, profileVersion: 0, communityIds: [] })
            .expect(200)
        ).body.data;
        assert.deepEqual(p.onboarding, base);
        assert.equal(p.profileTheme, 'LIGHT');
        assert.equal(p.handle, user.handle);
        assert.equal(p.id, user.id);
        assert.equal(p.profileVersion, 1);
        assert.ok(p.onboardingCompletedAt);
        completedAt = p.onboardingCompletedAt;
        assert.deepEqual(
          await db.session.findMany({
            where: { userId: user.id },
            select: { id: true },
          }),
          sessions,
        );
        assert.deepEqual(
          await db.passkey.findMany({
            where: { userId: user.id },
            select: { id: true },
          }),
          keys,
        );
        assert.equal(
          await db.auditEvent.count({
            where: { userId: user.id, kind: 'onboarding.completed' },
          }),
          1,
        );
      },
    );
    await t.test(
      'preferences do not appear in auth summaries or another user’s profile',
      async () => {
        assert.equal(
          (await agent.get('/v1/auth/me').expect(200)).body.data.onboarding,
          undefined,
        );
        assert.equal(
          (await other.get('/v1/users/me').expect(200)).body.data.onboarding,
          null,
        );
        await other.get('/v1/users/' + user.id).expect(404);
      },
    );
    await t.test(
      'concurrent preference edits cannot overwrite each other silently',
      async () => {
        const responses = await Promise.all([
          put(agent, { ...base, profileVersion: 1, backgroundId: 'alpine' }),
          put(agent, { ...base, profileVersion: 1, backgroundId: 'city' }),
        ]);
        assert.deepEqual(
          responses.map((r) => r.status).sort((a, b) => a - b),
          [200, 409],
        );
        const p = (await agent.get('/v1/users/me').expect(200)).body.data;
        assert.equal(p.profileVersion, 2);
        assert.ok(['alpine', 'city'].includes(p.onboarding.backgroundId));
        assert.equal(p.onboardingCompletedAt, completedAt);
        assert.equal(
          await db.userOnboarding.count({ where: { userId: user.id } }),
          1,
        );
      },
    );
    await t.test(
      'editing interests preserves a separately changed theme and original completion time',
      async () => {
        await agent
          .patch('/v1/users/me')
          .set('Origin', origin)
          .send({ profileVersion: 2, profileTheme: 'DARK' })
          .expect(200);
        const p = (
          await put(agent, {
            ...base,
            profileVersion: 3,
            backgroundId: 'midnight',
            interests: ['food'],
          }).expect(200)
        ).body.data;
        assert.equal(p.profileTheme, 'DARK');
        assert.equal(p.onboardingCompletedAt, completedAt);
        assert.deepEqual(p.onboarding.interests, ['food']);
      },
    );
    await t.test(
      'create intent cannot attach a new identity to an already authenticated browser',
      async () => {
        await post(agent, 'auth/registration/options', {
          handle: 'new_' + randomUUID().replaceAll('-', '').slice(0, 20),
          intent: 'create',
        }).expect(409);
        await post(agent, 'auth/registration/options', {
          handle: 'another_name',
        }).expect(409);
        assert.equal(await db.passkey.count({ where: { userId: user.id } }), 1);
        await post(request(server), 'auth/registration/options', {
          intent: 'add',
        }).expect(401);
      },
    );
    await t.test(
      'explicit create intent safely handles an expired cookie without reusing the expired identity',
      async () => {
        const stale = request.agent(server);
        stale.jar.setCookie(
          'circle_session=' + randomBytes(32).toString('base64url'),
        );
        const p = await register(
          stale,
          'fresh_' + randomUUID().replaceAll('-', '').slice(0, 20),
        );
        assert.notEqual(p.id, user.id);
        assert.equal(p.onboarding, null);
      },
    );
    await t.test(
      'a fabricated account session without a passkey cannot complete setup',
      async () => {
        const record = await db.user.create({
          data: {
            handle: 'nokey_' + randomUUID().replaceAll('-', '').slice(0, 20),
          },
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
        await request(server)
          .put('/v1/users/me/onboarding')
          .set('Authorization', 'Bearer ' + token)
          .set('Origin', origin)
          .send({ ...base, profileVersion: 0 })
          .expect(403);
        assert.equal(
          await db.userOnboarding.count({ where: { userId: record.id } }),
          0,
        );
      },
    );
    assert.deepEqual(
      await db.community.findMany({
        orderBy: { slug: 'asc' },
        select: { id: true, slug: true },
      }),
      communities,
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
