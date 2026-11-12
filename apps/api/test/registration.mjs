import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import request from 'supertest';
import { authenticator } from './authenticator.mjs';
if (
  process.env.NODE_ENV !== 'test' ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test') ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error('Isolated test infrastructure required');
process.env.AUTH_RATE_LIMIT = '500';
const { createApplication } = await import('../dist/app.js');
const { DatabaseService } =
  await import('../dist/database/database.service.js');
await test('complete registration and secure recovery lifecycle', async (t) => {
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer(),
    db = app.get(DatabaseService),
    origin = 'http://localhost:3000',
    agent = request.agent(server),
    ids = [];
  const post = (a, path, body) =>
    a
      .post('/v1/' + path)
      .set('Origin', origin)
      .send(body);
  const prefs = {
    profileVersion: 0,
    gender: null,
    vibe: 'BOLD',
    backgroundId: 'ember',
    interests: ['technology'],
    communityIds: [],
  };
  let user, code, second;
  try {
    await t.test(
      'requires passkeys, recovery confirmation and valid preferences before completion',
      async () => {
        const key = authenticator(),
          options = await post(agent, 'auth/registration/options', {}).expect(
            201,
          );
        await post(
          agent,
          'auth/registration/verify',
          key.register(options.body.data),
        ).expect(200);
        user = (await agent.get('/v1/users/me')).body.data;
        ids.push(user.id);
        await agent.get('/v1/feed').expect(403);
        await post(agent, 'users/me/complete', prefs).expect(403);
        await agent
          .put('/v1/users/me/onboarding')
          .set('Origin', origin)
          .send({ ...prefs, communityIds: undefined })
          .expect(403);
        await post(request(server), 'auth/recovery/issue', {}).expect(401);
        await agent
          .post('/v1/auth/recovery/issue')
          .set('Origin', 'https://evil.example')
          .send({})
          .expect(403);
        code = (await post(agent, 'auth/recovery/issue', {}).expect(201)).body
          .data.code;
        const row = await db.recoveryCredential.findUnique({
          where: { id: code.split('.')[1] },
        });
        assert.equal(
          row.verifier,
          createHash('sha256')
            .update('circle-recovery:' + code)
            .digest('hex'),
        );
        assert.ok(!JSON.stringify(row).includes(code));
        await post(request.agent(server), 'auth/recovery/options', {
          code,
        }).expect(401);
        await post(agent, 'auth/recovery/confirm', { code }).expect(200);
        await post(agent, 'users/me/complete', {
          ...prefs,
          communityIds: [randomUUID()],
        }).expect(403);
        assert.equal(
          await db.communityMembership.count({ where: { userId: user.id } }),
          0,
        );
        const communities = await db.community.findMany({
          where: { isActive: true },
          take: 2,
        });
        assert.equal(communities.length, 2);
        prefs.communityIds = communities.map((c) => c.id);
        const done = await post(agent, 'users/me/complete', prefs).expect(200);
        assert.ok(done.body.data.onboardingCompletedAt);
        assert.equal(done.body.data.id, user.id);
        assert.equal(
          await db.communityMembership.count({ where: { userId: user.id } }),
          2,
        );
        await post(agent, 'users/me/complete', prefs).expect(409);
      },
    );
    await t.test(
      'feed is personalized from real posts and active communities',
      async () => {
        const communities = await db.community.findMany({
            where: { isActive: true },
          }),
          other = communities.find((c) => !prefs.communityIds.includes(c.id));
        await db.post.createMany({
          data: [
            {
              authorId: user.id,
              communityId: prefs.communityIds[0],
              text: 'Joined community post',
              interests: [],
            },
            {
              authorId: user.id,
              communityId: other.id,
              text: 'Interest match',
              interests: ['technology'],
            },
            {
              authorId: user.id,
              communityId: other.id,
              text: 'Unrelated',
              interests: ['food'],
            },
          ],
        });
        const feed = (await agent.get('/v1/feed').expect(200)).body.data;
        assert.deepEqual(
          new Set(feed.items.map((x) => x.text)),
          new Set(['Joined community post', 'Interest match']),
        );
        assert.equal(feed.communities.length, 2);
        assert.deepEqual(feed.interests, ['technology']);
      },
    );
    await t.test(
      'pending replacement does not revoke the confirmed recovery credential',
      async () => {
        second = (await post(agent, 'auth/recovery/issue', {}).expect(201)).body
          .data.code;
        const row = await db.recoveryCredential.findUnique({
          where: { id: code.split('.')[1] },
        });
        assert.equal(row.revokedAt, null);
        await post(request.agent(server), 'auth/recovery/options', {
          code: second,
        }).expect(401);
        await post(request.agent(server), 'auth/recovery/options', {
          code: 'CS1.' + randomUUID() + '.' + 'a'.repeat(43),
        }).expect(401);
        await post(request.agent(server), 'auth/recovery/options', {
          code: 'CS1.' + '-'.repeat(36) + '.' + 'a'.repeat(43),
        }).expect(400);
      },
    );
    await t.test(
      'expiry is rechecked after the recovery challenge is issued',
      async () => {
        const client = request.agent(server),
          options = await post(client, 'auth/recovery/options', {
            code,
          }).expect(201);
        const row = await db.recoveryCredential.findUnique({
          where: { id: code.split('.')[1] },
        });
        await db.recoveryCredential.update({
          where: { id: row.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await post(
          client,
          'auth/recovery/verify',
          authenticator().register(options.body.data),
        ).expect(401);
        assert.equal(
          (await db.recoveryCredential.findUnique({ where: { id: row.id } }))
            .usedAt,
          null,
        );
        await db.recoveryCredential.update({
          where: { id: row.id },
          data: { expiresAt: row.expiresAt },
        });
      },
    );
    await t.test(
      'invalid authenticator does not consume recovery; successful concurrent redemption is single-use',
      async () => {
        const bad = request.agent(server),
          opt = await post(bad, 'auth/recovery/options', { code }).expect(201);
        await post(
          bad,
          'auth/recovery/verify',
          authenticator().register(opt.body.data, { verified: false }),
        ).expect(401);
        assert.equal(
          (
            await db.recoveryCredential.findUnique({
              where: { id: code.split('.')[1] },
            })
          ).usedAt,
          null,
        );
        const clients = [request.agent(server), request.agent(server)],
          keys = [authenticator(), authenticator()];
        const options = await Promise.all(
          clients.map((c) =>
            post(c, 'auth/recovery/options', { code }).expect(201),
          ),
        );
        const results = await Promise.all(
          clients.map((c, i) =>
            post(
              c,
              'auth/recovery/verify',
              keys[i].register(options[i].body.data),
            ),
          ),
        );
        assert.deepEqual(
          results.map((r) => r.status).sort((a, b) => a - b),
          [200, 401],
        );
        const winner = clients[results.findIndex((r) => r.status === 200)];
        assert.equal(
          (await winner.get('/v1/users/me').expect(200)).body.data.id,
          user.id,
        );
        await agent.get('/v1/users/me').expect(401);
        await post(request.agent(server), 'auth/recovery/options', {
          code,
        }).expect(401);
        assert.ok(
          (
            await db.recoveryCredential.findUnique({
              where: { id: code.split('.')[1] },
            })
          ).usedAt,
        );
        assert.equal(await db.passkey.count({ where: { userId: user.id } }), 2);
      },
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
