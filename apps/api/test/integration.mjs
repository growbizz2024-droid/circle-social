import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { INITIAL_COMMUNITIES } from '@circle/constants';
import request from 'supertest';
import { authenticator } from './authenticator.mjs';
if (
  process.env.NODE_ENV !== 'test' ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test') ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error(
    'Integration tests require an isolated _test database and Redis database 1',
  );
const { createApplication } = await import('../dist/app.js');
const { DatabaseService } =
  await import('../dist/database/database.service.js');
const { CacheService } = await import('../dist/cache/cache.service.js');
const origin = 'http://localhost:3000';
const handle = `cs_test_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
await test('API database, auth, sessions, replay, validation, rate limiting and failure handling', async (t) => {
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const db = app.get(DatabaseService);
  const cache = app.get(CacheService);
  const agent = request.agent(server);
  const key = authenticator();
  const post = (path) => agent.post('/v1/auth/' + path).set('Origin', origin);
  try {
    await t.test(
      'live and ready report dependencies and security headers',
      async () => {
        const r = await request(server).get('/v1/health/ready').expect(200);
        assert.equal(r.body.data.database, 'up');
        assert.ok(r.headers['x-request-id']);
        assert.ok(r.headers['x-content-type-options']);
        await request(server).get('/v1/health/live').expect(200);
      },
    );
    await t.test(
      'invalid payload and cross-origin registration rejected',
      async () => {
        await post('registration/options')
          .send({ handle: 'INVALID!' })
          .expect(400);
        await agent
          .post('/v1/auth/registration/options')
          .set('Origin', 'https://evil.example')
          .send({ handle })
          .expect(403);
      },
    );
    await t.test(
      'malformed and oversized JSON are rejected safely',
      async () => {
        const malformed = await post('registration/options')
          .set('Content-Type', 'application/json')
          .send('{broken')
          .expect(400);
        assert.equal(
          JSON.stringify(malformed.body).includes('SyntaxError'),
          false,
        );
        await post('registration/options')
          .send({ handle: 'x'.repeat(70000) })
          .expect(413);
      },
    );
    await t.test(
      'canonical community seed is stable and idempotent',
      async () => {
        execFileSync('pnpm', ['db:seed'], { env: process.env, stdio: 'pipe' });
        const before = await db.community.findMany({
          where: { slug: { in: INITIAL_COMMUNITIES.map((c) => c.slug) } },
          orderBy: { slug: 'asc' },
        });
        assert.equal(before.length, 5);
        execFileSync('pnpm', ['db:seed'], { env: process.env, stdio: 'pipe' });
        const after = await db.community.findMany({
          where: { slug: { in: INITIAL_COMMUNITIES.map((c) => c.slug) } },
          orderBy: { slug: 'asc' },
        });
        assert.deepEqual(
          after.map((c) => [c.id, c.slug, c.name]),
          before.map((c) => [c.id, c.slug, c.name]),
        );
        for (const c of INITIAL_COMMUNITIES)
          assert.equal(after.find((row) => row.slug === c.slug)?.name, c.name);
      },
    );
    let registration;
    await t.test(
      'registration issues resident user-verified options',
      async () => {
        const r = await post('registration/options')
          .send({ handle })
          .expect(201);
        registration = r.body.data;
        assert.equal(
          registration.authenticatorSelection.userVerification,
          'required',
        );
      },
    );
    const response = key.register(registration);
    await t.test('challenge is bound to browser cookie', async () => {
      await request(server)
        .post('/v1/auth/registration/verify')
        .set('Origin', origin)
        .send(response)
        .expect(401);
    });
    await t.test(
      'real signed registration establishes an opaque session',
      async () => {
        const r = await post('registration/verify').send(response).expect(200);
        assert.equal(r.body.data.authenticated, true);
        assert.ok(
          r.headers['set-cookie'].some(
            (c) =>
              c.startsWith('circle_session=') &&
              c.includes('HttpOnly') &&
              c.includes('SameSite=Strict'),
          ),
        );
        const me = await agent.get('/v1/auth/me').expect(200);
        assert.equal(me.body.data.handle, handle);
        const row = await db.session.findFirst({ where: { user: { handle } } });
        assert.equal(row.tokenHash.length, 64);
      },
    );
    await t.test(
      'database constraints enforce unique memberships and cascading cleanup',
      async () => {
        const user = await db.user.findUniqueOrThrow({ where: { handle } });
        const community = await db.community.create({
          data: { slug: `fixture-${randomUUID()}`, name: 'Test fixture' },
        });
        try {
          await db.communityMembership.create({
            data: { userId: user.id, communityId: community.id },
          });
          await assert.rejects(
            () =>
              db.communityMembership.create({
                data: { userId: user.id, communityId: community.id },
              }),
            (error) => error.code === 'P2002',
          );
          await db.community.delete({ where: { id: community.id } });
          assert.equal(
            await db.communityMembership.count({
              where: { communityId: community.id },
            }),
            0,
          );
        } finally {
          await db.community.deleteMany({ where: { id: community.id } });
        }
      },
    );
    await t.test('registration replay rejected', async () => {
      await post('registration/verify').send(response).expect(401);
    });
    await t.test(
      'session listing and revocation reject subsequent access',
      async () => {
        const r = await agent.get('/v1/auth/sessions').expect(200);
        assert.equal(r.body.data.length, 1);
        assert.equal(r.body.data[0].tokenHash, undefined);
        await post('logout').send({}).expect(200);
        await agent.get('/v1/auth/me').expect(401);
      },
    );
    let login;
    await t.test(
      'real signed authentication and replay protection',
      async () => {
        const r = await post('authentication/options').send({}).expect(201);
        login = r.body.data;
        const assertion = key.authenticate(login);
        await post('authentication/verify').send(assertion).expect(200);
        await post('authentication/verify').send(assertion).expect(401);
        await agent.get('/v1/auth/me').expect(200);
      },
    );
    await t.test(
      'recently authenticated users can add and remove a second real passkey',
      async () => {
        const extra = authenticator();
        const options = await post('registration/options')
          .send({ handle })
          .expect(201);
        await post('registration/verify')
          .send(extra.register(options.body.data))
          .expect(200);
        const keys = await agent.get('/v1/auth/passkeys').expect(200);
        assert.equal(keys.body.data.length, 2);
        await agent
          .delete('/v1/auth/passkeys/' + extra.id)
          .set('Origin', origin)
          .expect(200);
        assert.equal(
          await db.passkey.count({ where: { user: { handle } } }),
          1,
        );
      },
    );
    await t.test(
      'signed assertions with a wrong challenge or RP ID are rejected',
      async () => {
        const first = await post('authentication/options').send({}).expect(201);
        await post('authentication/verify')
          .send(
            key.authenticate(
              { ...first.body.data, challenge: 'invalidchallenge' },
              { counter: 2 },
            ),
          )
          .expect(401);
        const second = await post('authentication/options')
          .send({})
          .expect(201);
        await post('authentication/verify')
          .send(
            key.authenticate(
              { ...second.body.data, rpId: 'evil.example' },
              { counter: 2 },
            ),
          )
          .expect(401);
      },
    );
    await t.test('invalid cryptographic signatures are rejected', async () => {
      const options = await post('authentication/options').send({}).expect(201);
      const assertion = key.authenticate(options.body.data, { counter: 2 });
      const signature = Buffer.from(assertion.response.signature, 'base64url');
      signature[signature.length - 1] ^= 1;
      assertion.response.signature = signature.toString('base64url');
      await post('authentication/verify').send(assertion).expect(401);
    });
    await t.test('counter rollback rejected', async () => {
      const r = await post('authentication/options').send({}).expect(201);
      await post('authentication/verify')
        .send(key.authenticate(r.body.data, { counter: 1 }))
        .expect(401);
    });
    await t.test('wrong origin signature rejected', async () => {
      const r = await post('authentication/options').send({}).expect(201);
      await post('authentication/verify')
        .send(
          key.authenticate(r.body.data, {
            counter: 2,
            origin: 'https://evil.example',
          }),
        )
        .expect(401);
    });
    await t.test('user verification required', async () => {
      const r = await post('authentication/options').send({}).expect(201);
      await post('authentication/verify')
        .send(key.authenticate(r.body.data, { counter: 2, verified: false }))
        .expect(401);
    });
    await t.test('user handle mismatch rejected', async () => {
      const r = await post('authentication/options').send({}).expect(201);
      await post('authentication/verify')
        .send(
          key.authenticate(r.body.data, { counter: 2, userHandle: 'd3Jvbmc' }),
        )
        .expect(401);
    });
    await t.test(
      'last passkey cannot be removed and public key stays private',
      async () => {
        const r = await agent.get('/v1/auth/passkeys').expect(200);
        assert.equal(r.body.data[0].publicKey, undefined);
        await agent
          .delete('/v1/auth/passkeys/' + key.id)
          .set('Origin', origin)
          .expect(403);
      },
    );
    await t.test(
      'expired sessions and suspended users are rejected',
      async () => {
        await db.session.updateMany({
          where: { user: { handle } },
          data: { expiresAt: new Date(0) },
        });
        await agent.get('/v1/auth/me').expect(401);
        const r = await post('authentication/options').send({}).expect(201);
        await db.user.update({
          where: { handle },
          data: { status: 'SUSPENDED' },
        });
        await post('authentication/verify')
          .send(key.authenticate(r.body.data, { counter: 2 }))
          .expect(401);
      },
    );
    await t.test(
      'community pagination rejects unbounded requests',
      async () => {
        await request(server).get('/v1/communities?limit=100000').expect(400);
        await request(server).get('/v1/communities').expect(200);
      },
    );
    await t.test('readiness failure hides internal errors', async () => {
      const original = cache.client.ping.bind(cache.client);
      cache.client.ping = async () => {
        throw new Error('private secret');
      };
      try {
        const r = await request(server).get('/v1/health/ready').expect(503);
        assert.equal(JSON.stringify(r.body).includes('private secret'), false);
        await request(server).get('/v1/health/live').expect(200);
      } finally {
        cache.client.ping = original;
      }
    });
    await t.test(
      'rate limiter uses expiry and rejects excess attempts',
      async () => {
        const k = 'fixture:' + randomUUID();
        assert.equal(await cache.rateLimit(k, 1, 1), true);
        assert.equal(await cache.rateLimit(k, 1, 1), false);
        await cache.client.del('rate:' + k);
      },
    );
    await t.test(
      'challenge consumption is atomic and expiry enforced',
      async () => {
        const k = 'challenge:fixture:' + randomUUID();
        await cache.client.set(k, 'value', 'EX', 1);
        const taken = await Promise.all([cache.take(k), cache.take(k)]);
        assert.equal(taken.filter((v) => v === 'value').length, 1);
        assert.equal(taken.filter((v) => v === null).length, 1);
        assert.equal(await cache.take(k), null);
        await cache.client.set(k, 'expired', 'PX', 1);
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(await cache.take(k), null);
      },
    );
    await t.test('HTTP throttling responds with 429', async () => {
      await cache.client.set('rate:http:127.0.0.1', '121', 'EX', 60);
      try {
        await request(server).get('/v1/communities').expect(429);
      } finally {
        await cache.client.del('rate:http:127.0.0.1');
      }
    });
  } finally {
    await db.user.deleteMany({ where: { handle } });
    await app.close();
  }
});
