import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import request from 'supertest';
import { authenticator } from './authenticator.mjs';
if (
  process.env.NODE_ENV !== 'test' ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test') ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error('Isolated infrastructure required');
process.env.AUTH_RATE_LIMIT = '500';
const { createApplication } = await import('../dist/app.js');
const { DatabaseService } =
  await import('../dist/database/database.service.js');
const { GeoIpService } = await import('../dist/location/geoip.service.js');
const { environment } = await import('../dist/core/environment.js');
await test('login location is private, trustworthy and bounded by session lifetime', async (t) => {
  const previous = environment.GEOIP_PROXY_SECRET,
    secret = 'test-proxy-signing-key-'.repeat(3);
  environment.GEOIP_PROXY_SECRET = secret;
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer(),
    db = app.get(DatabaseService),
    geo = app.get(GeoIpService),
    origin = 'http://localhost:3000',
    agent = request.agent(server),
    other = request.agent(server),
    ids = [];
  const london = {
      city: 'London',
      country: 'United Kingdom',
      countryCode: 'GB',
      approximate: true,
    },
    delhi = {
      city: 'Delhi',
      country: 'India',
      countryCode: 'IN',
      approximate: true,
    };
  const lookup = geo.lookup.bind(geo);
  geo.lookup = (ip) =>
    ip === '8.8.8.8' ? london : ip === '1.1.1.1' ? delhi : null;
  const post = (a, path, body, ip) => {
    let r = a.post('/v1/' + path).set('Origin', origin);
    if (ip) {
      const at = String(Date.now());
      r = r
        .set('x-circle-client-ip', ip)
        .set('x-circle-client-ip-at', at)
        .set(
          'x-circle-client-ip-signature',
          createHmac('sha256', secret)
            .update(`POST\n/v1/${path}\n${ip}\n${at}`)
            .digest('hex'),
        );
    }
    return r.send(body);
  };
  const key = authenticator(),
    replacement = authenticator();
  let user, oldSession, recovered;
  async function register(a, ip) {
    const k = a === agent ? key : authenticator();
    const options = (await post(a, 'auth/registration/options', {}).expect(201))
      .body.data;
    await post(a, 'auth/registration/verify', k.register(options), ip).expect(
      200,
    );
    const p = (await a.get('/v1/users/me')).body.data;
    ids.push(p.id);
    return p;
  }
  try {
    await t.test(
      'successful signed registration stores only a city/country snapshot',
      async () => {
        user = await register(agent, '8.8.8.8');
        const sessions = (await agent.get('/v1/auth/sessions').expect(200)).body
          .data;
        assert.deepEqual(sessions[0].location, london);
        oldSession = sessions[0].id;
        const row = await db.session.findUnique({ where: { id: oldSession } });
        assert.equal(row.locationCity, 'London');
        assert.ok(!JSON.stringify(row).includes('8.8.8.8'));
        assert.equal(row.latitude, undefined);
        assert.equal(row.longitude, undefined);
      },
    );
    await t.test(
      'location is absent from public/auth profile DTOs and inaccessible to other accounts',
      async () => {
        await register(other);
        assert.equal(
          (await agent.get('/v1/auth/me')).body.data.location,
          undefined,
        );
        assert.equal(
          (await agent.get('/v1/users/me')).body.data.location,
          undefined,
        );
        const sessions = (await other.get('/v1/auth/sessions').expect(200)).body
          .data;
        assert.ok(sessions.every((s) => s.id !== oldSession));
        assert.ok(sessions.every((s) => s.location === null));
      },
    );
    await t.test(
      'logout clears the snapshot and later login captures the new network location',
      async () => {
        await post(agent, 'auth/logout', {}).expect(200);
        assert.equal(
          (await db.session.findUnique({ where: { id: oldSession } }))
            .locationCity,
          null,
        );
        const options = (
          await post(agent, 'auth/authentication/options', {}).expect(201)
        ).body.data;
        await post(
          agent,
          'auth/authentication/verify',
          key.authenticate(options),
          '1.1.1.1',
        ).expect(200);
        const sessions = (await agent.get('/v1/auth/sessions')).body.data;
        assert.deepEqual(sessions.find((s) => s.current).location, delhi);
      },
    );
    await t.test(
      'unsigned and forged forwarded headers cannot create a false login location',
      async () => {
        await post(agent, 'auth/logout', {}).expect(200);
        const options = (await post(agent, 'auth/authentication/options', {}))
          .body.data;
        await post(
          agent,
          'auth/authentication/verify',
          key.authenticate(options, { counter: 2 }),
        )
          .set('x-forwarded-for', '8.8.8.8')
          .set('x-circle-client-ip', '8.8.8.8')
          .set('x-circle-client-ip-at', String(Date.now()))
          .set('x-circle-client-ip-signature', '0'.repeat(64))
          .expect(200);
        assert.equal(
          (await agent.get('/v1/auth/sessions')).body.data.find(
            (s) => s.current,
          ).location,
          null,
        );
      },
    );
    await t.test(
      'recovery captures its new session and removes snapshots from revoked sessions',
      async () => {
        const code = (await post(agent, 'auth/recovery/issue', {})).body.data
          .code;
        await post(agent, 'auth/recovery/confirm', { code }).expect(200);
        recovered = request.agent(server);
        const options = (
          await post(recovered, 'auth/recovery/options', { code }).expect(201)
        ).body.data;
        await post(
          recovered,
          'auth/recovery/verify',
          replacement.register(options),
          '8.8.8.8',
        ).expect(200);
        const sessions = (await recovered.get('/v1/auth/sessions')).body.data;
        assert.deepEqual(sessions.find((s) => s.current).location, london);
        const revoked = await db.session.findMany({
          where: { userId: user.id, revokedAt: { not: null } },
        });
        assert.ok(
          revoked.every(
            (s) =>
              s.locationCity === null &&
              s.locationCountry === null &&
              s.locationCountryCode === null,
          ),
        );
      },
    );
    await t.test(
      'mobile exchange captures the app network rather than copying browser location',
      async () => {
        const verifier = randomBytes(32).toString('base64url'),
          challenge = createHash('sha256').update(verifier).digest('base64url');
        const code = (
          await post(recovered, 'auth/mobile/authorize', { challenge }).expect(
            200,
          )
        ).body.data.code;
        const token = (
          await post(
            request(server),
            'auth/mobile/exchange',
            { code, verifier },
            '1.1.1.1',
          ).expect(200)
        ).body.data.token;
        const sessions = (
          await request(server)
            .get('/v1/auth/sessions')
            .set('Authorization', 'Bearer ' + token)
            .expect(200)
        ).body.data;
        assert.deepEqual(sessions.find((s) => s.current).location, delhi);
        const current = sessions.find((s) => s.current);
        await recovered
          .delete('/v1/auth/sessions/' + current.id)
          .set('Origin', origin)
          .expect(200);
        const row = await db.session.findUnique({ where: { id: current.id } });
        assert.equal(row.locationCountry, null);
      },
    );
    await t.test(
      'expired snapshots are pruned without altering authentication records',
      async () => {
        const record = await db.session.create({
          data: {
            userId: user.id,
            tokenHash: createHash('sha256')
              .update(randomBytes(32))
              .digest('hex'),
            expiresAt: new Date(Date.now() - 1000),
            locationCity: 'London',
            locationCountry: 'United Kingdom',
            locationCountryCode: 'GB',
          },
        });
        await geo.pruneExpired();
        const row = await db.session.findUniqueOrThrow({
          where: { id: record.id },
        });
        assert.equal(row.locationCity, null);
        assert.equal(row.locationCountry, null);
        assert.equal(row.locationCountryCode, null);
        assert.equal(row.userId, user.id);
      },
    );
    await t.test(
      'deactivation clears all remaining location snapshots',
      async () => {
        await post(recovered, 'users/me/deactivate', {
          confirmation: user.handle,
        }).expect(200);
        const records = await db.session.findMany({
          where: { userId: user.id },
        });
        assert.ok(
          records.every(
            (s) =>
              s.locationCity === null &&
              s.locationCountry === null &&
              s.locationCountryCode === null,
          ),
        );
      },
    );
  } finally {
    geo.lookup = lookup;
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
    environment.GEOIP_PROXY_SECRET = previous;
  }
});
