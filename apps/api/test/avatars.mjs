import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import sharp from 'sharp';
import { generateAvatar, isAvatarSpec } from '@circle/avatar-engine';
import { authenticator } from './authenticator.mjs';
if (
  process.env.NODE_ENV !== 'test' ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test') ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error('Avatar tests require isolated infrastructure');
process.env.AUTH_RATE_LIMIT = '500';
const { createApplication } = await import('../dist/app.js');
const { DatabaseService } =
  await import('../dist/database/database.service.js');
await test('procedural avatars preserve identity, ownership and cross-device state', async (t) => {
  execFileSync(process.execPath, ['scripts/reset-e2e-limits.mjs']);
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer(),
    db = app.get(DatabaseService),
    a = request.agent(server),
    b = request.agent(server),
    ids = [],
    origin = 'http://localhost:3000';
  const send = (client, method, path, body) =>
    client[method]('/v1/' + path)
      .set('Origin', origin)
      .send(body);
  const keys = new Map();
  const register = async (client, avatar) => {
    const handle = 'avatar_' + randomUUID().replaceAll('-', '').slice(0, 20),
      key = authenticator();
    const opt = await send(client, 'post', 'auth/registration/options', {
      handle,
      intent: 'create',
      ...(avatar ? { avatar } : {}),
    }).expect(201);
    await send(
      client,
      'post',
      'auth/registration/verify',
      key.register(opt.body.data),
    ).expect(200);
    const persisted = await db.user.findUniqueOrThrow({
      where: { handle },
      include: { avatar: true },
    });
    assert.ok(
      persisted.avatar,
      'avatar must exist before the first profile read',
    );
    const p = (await client.get('/v1/users/me').expect(200)).body.data;
    ids.push(p.id);
    keys.set(p.id, key);
    return p;
  };
  let current, user, other;
  try {
    await t.test(
      'registration atomically creates one avatar and honors a chosen preview',
      async () => {
        const chosen = generateAvatar('chosen-onboarding-seed');
        chosen.config.skinTone = 'deep';
        user = await register(a, chosen);
        other = await register(b);
        assert.deepEqual(user.avatar, chosen);
        assert.ok(isAvatarSpec(other.avatar));
        assert.notEqual(user.avatar.seed, other.avatar.seed);
        assert.equal(
          await db.userAvatar.count({ where: { userId: user.id } }),
          1,
        );
        assert.equal(await db.passkey.count({ where: { userId: user.id } }), 1);
        current = (await a.get('/v1/avatars/me').expect(200)).body.data;
      },
    );
    await t.test(
      'avatar endpoints authenticate, enforce Origin and reject ownership injection',
      async () => {
        await request(server).get('/v1/avatars/me').expect(401);
        await a
          .patch('/v1/avatars/me')
          .set('Origin', 'https://evil.invalid')
          .send({ ...user.avatar, revision: 0 })
          .expect(403);
        await send(a, 'patch', 'avatars/me', {
          ...user.avatar,
          revision: 0,
          userId: other.id,
        }).expect(400);
        await send(a, 'post', 'avatars/generate', { userId: other.id }).expect(
          400,
        );
      },
    );
    await t.test(
      'generation is an unsaved preview, while valid customization persists',
      async () => {
        const candidate = (
          await send(a, 'post', 'avatars/generate', {}).expect(201)
        ).body.data;
        assert.ok(isAvatarSpec(candidate));
        assert.notEqual(candidate.seed, current.seed);
        assert.equal(
          (await a.get('/v1/avatars/me').expect(200)).body.data.seed,
          current.seed,
        );
        candidate.config.accessory = 'headphones';
        current = (
          await send(a, 'patch', 'avatars/me', {
            ...candidate,
            revision: current.revision,
          }).expect(200)
        ).body.data;
        const nextDevice = (await a.get('/v1/avatars/me').expect(200)).body
          .data;
        assert.deepEqual(nextDevice, current);
        assert.equal(
          (await b.get('/v1/avatars/me').expect(200)).body.data.seed,
          other.avatar.seed,
        );
        assert.equal(
          (await a.get('/v1/users/me').expect(200)).body.data.id,
          user.id,
        );
        assert.equal(await db.passkey.count({ where: { userId: user.id } }), 1);
      },
    );
    await t.test(
      'concurrent devices cannot silently overwrite each other',
      async () => {
        const results = await Promise.all([
          send(a, 'patch', 'avatars/me', {
            ...generateAvatar('device-a'),
            revision: current.revision,
          }),
          send(a, 'patch', 'avatars/me', {
            ...generateAvatar('device-b'),
            revision: current.revision,
          }),
        ]);
        assert.deepEqual(
          results.map((r) => r.status).sort((a, b) => a - b),
          [200, 409],
        );
        current = (await a.get('/v1/avatars/me').expect(200)).body.data;
      },
    );
    await t.test(
      'randomize and reset preserve the original default and reject unsafe configuration',
      async () => {
        const initial = current.defaultSeed;
        current = (
          await send(a, 'post', 'avatars/me/randomize', {
            revision: current.revision,
          }).expect(200)
        ).body.data;
        assert.notEqual(current.seed, initial);
        current = (
          await send(a, 'post', 'avatars/me/reset', {
            revision: current.revision,
          }).expect(200)
        ).body.data;
        assert.deepEqual(current.config, generateAvatar(initial).config);
        assert.equal(current.seed, initial);
        const body = {
          version: 1,
          seed: current.seed,
          config: current.config,
          revision: current.revision,
        };
        await send(a, 'patch', 'avatars/me', { ...body, version: 999 }).expect(
          400,
        );
        await send(a, 'patch', 'avatars/me', {
          ...body,
          config: { ...current.config, hairColor: '<script>alert(1)</script>' },
        }).expect(400);
        await send(a, 'patch', 'avatars/me', {
          ...body,
          config: { ...current.config, svg: '<svg/>' },
        }).expect(400);
        assert.equal(
          (await a.get('/v1/avatars/me').expect(200)).body.data.revision,
          current.revision,
        );
      },
    );
    await t.test(
      'SVG and PNG exports are safe, reproducible and privately cached',
      async () => {
        const svg = await a
          .get('/v1/avatars/me/export/svg')
          .expect(200)
          .expect('Content-Type', /image\/svg\+xml/);
        assert.doesNotMatch(
          svg.text ?? svg.body.toString(),
          /<script|<foreignObject|<image/,
        );
        await a
          .get('/v1/avatars/me/export/svg')
          .set('If-None-Match', svg.headers.etag)
          .expect(304);
        const png = await a
          .get('/v1/avatars/me/export/png')
          .expect(200)
          .expect('Cache-Control', 'private, no-cache');
        assert.equal((await sharp(png.body).metadata()).width, 512);
      },
    );
    await t.test(
      'one avatar follows the user across communities without private record fields',
      async () => {
        await db.user.update({
          where: { id: user.id },
          data: { onboardingCompletedAt: new Date() },
        });
        const communities = await db.community.findMany({
          where: { isActive: true },
          take: 2,
        });
        for (const c of communities) {
          await send(a, 'put', `communities/${c.id}/membership`, {
            active: true,
          }).expect(200);
          const post = (
            await send(a, 'post', 'posts', {
              text: 'Same identity, same avatar.',
              communityId: c.id,
            }).expect(201)
          ).body.data;
          assert.equal(post.author.avatar.seed, current.seed);
          assert.deepEqual(post.author.avatar.config, current.config);
          assert.equal(post.author.avatar.defaultSeed, undefined);
          assert.equal(post.author.avatar.revision, undefined);
        }
        assert.equal(
          await db.userAvatar.count({ where: { userId: user.id } }),
          1,
        );
      },
    );
    await t.test(
      'unsupported stored versions have safe fallbacks and generation is rate limited',
      async () => {
        await db.userAvatar.update({
          where: { userId: other.id },
          data: { version: 99, config: { svg: 'unsafe' } },
        });
        assert.ok(
          isAvatarSpec((await b.get('/v1/avatars/me').expect(200)).body.data),
        );
        for (let i = 0; i < 20; i++)
          await send(b, 'post', 'avatars/generate', {}).expect(201);
        await send(b, 'post', 'avatars/generate', {}).expect(429);
      },
    );
    await t.test(
      'logout and a fresh signed device login preserve the saved avatar',
      async () => {
        const before = (await a.get('/v1/avatars/me').expect(200)).body.data;
        await send(a, 'post', 'auth/logout', {}).expect(200);
        await a.get('/v1/avatars/me').expect(401);
        assert.equal(
          await db.userAvatar.count({ where: { userId: user.id } }),
          1,
        );
        const device = request.agent(server),
          options = await send(
            device,
            'post',
            'auth/authentication/options',
            {},
          ).expect(201);
        await send(
          device,
          'post',
          'auth/authentication/verify',
          keys.get(user.id).authenticate(options.body.data),
        ).expect(200);
        assert.deepEqual(
          (await device.get('/v1/avatars/me').expect(200)).body.data,
          before,
        );
      },
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
    execFileSync(process.execPath, ['scripts/reset-e2e-limits.mjs']);
  }
});
