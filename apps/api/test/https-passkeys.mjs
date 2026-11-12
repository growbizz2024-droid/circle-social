import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { authenticator } from './authenticator.mjs';
if (
  process.env.NODE_ENV !== 'test' ||
  new URL(process.env.DATABASE_URL).pathname !== '/circle_social_test' ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error('Requires isolated test infrastructure');
const origin = 'https://circle-device.ngrok-free.dev';
process.env.WEB_ORIGIN = origin;
process.env.WEBAUTHN_RP_ID = new URL(origin).hostname;
process.env.AUTH_RATE_LIMIT = '200';
const { createApplication } = await import('../dist/app.js');
const { DatabaseService } =
  await import('../dist/database/database.service.js');
await test('HTTPS development preserves passkey verification, secure cookies and mobile PKCE', async () => {
  execFileSync(process.execPath, ['scripts/reset-e2e-limits.mjs']);
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer(),
    db = app.get(DatabaseService),
    cookies = new Map(),
    key = authenticator(),
    handle = 'https_' + randomUUID().replaceAll('-', '').slice(0, 20);
  let id;
  // TLS terminates at the tunnel. Model its forwarded HTTPS Origin and browser cookies explicitly.
  async function post(path, body, { cookie = true, from = origin } = {}) {
    const req = request(server)
      .post('/v1/' + path)
      .set('Origin', from);
    if (cookie && cookies.size)
      req.set('Cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await req.send(body);
    for (const entry of res.headers['set-cookie'] ?? []) {
      assert.match(entry, /; secure(?:;|$)/i);
      assert.match(entry, /HttpOnly/i);
      const pair = entry.split(';')[0],
        i = pair.indexOf('=');
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }
  try {
    const options = await post('auth/registration/options', {
      handle,
      intent: 'create',
    });
    assert.equal(options.status, 201);
    assert.equal(options.body.data.rp.id, 'circle-device.ngrok-free.dev');
    assert.equal(
      (
        await post(
          'auth/registration/verify',
          key.register(options.body.data, { origin }),
        )
      ).status,
      200,
    );
    const profile = await request(server)
      .get('/v1/users/me')
      .set('Cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    assert.equal(profile.status, 200);
    id = profile.body.data.id;
    assert.equal(
      (
        await post(
          'auth/registration/options',
          {},
          { from: 'http://localhost:3200' },
        )
      ).status,
      403,
    );
    const verifier = randomBytes(32).toString('base64url'),
      challenge = createHash('sha256').update(verifier).digest('base64url'),
      grant = await post('auth/mobile/authorize', { challenge });
    assert.equal(grant.status, 200);
    assert.equal(
      (
        await post(
          'auth/mobile/exchange',
          {
            code: grant.body.data.code,
            verifier: 'incorrect-verifier'.repeat(4),
          },
          { cookie: false },
        )
      ).status,
      401,
    );
    const fresh = await post('auth/mobile/authorize', { challenge }),
      exchange = await post(
        'auth/mobile/exchange',
        { code: fresh.body.data.code, verifier },
        { cookie: false },
      );
    assert.equal(exchange.status, 200);
    assert.equal(
      (
        await request(server)
          .get('/v1/users/me')
          .set('Authorization', 'Bearer ' + exchange.body.data.token)
      ).body.data.id,
      id,
    );
    assert.equal(
      (
        await post(
          'auth/mobile/exchange',
          { code: fresh.body.data.code, verifier },
          { cookie: false },
        )
      ).status,
      401,
    );
  } finally {
    if (id) await db.user.delete({ where: { id } });
    else await db.user.deleteMany({ where: { handle } });
    await app.close();
  }
});
