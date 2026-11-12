import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import sharp from 'sharp';
import {
  DEFAULT_THEME,
  THEME_PALETTES,
  isThemeConfig,
  themeContrastIssues,
  themeBackgroundSvg,
  safeTheme,
} from '@circle/design-tokens';
import { authenticator } from './authenticator.mjs';
if (
  process.env.NODE_ENV !== 'test' ||
  new URL(process.env.DATABASE_URL).pathname !== '/circle_social_test' ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error('Themes require isolated test infrastructure');
process.env.AUTH_RATE_LIMIT = '500';
const { createApplication } = await import('../dist/app.js');
const { DatabaseService } =
  await import('../dist/database/database.service.js');
const copy = (v) => JSON.parse(JSON.stringify(v));
await test('versioned account themes are safe, private and persistent', async (t) => {
  execFileSync(process.execPath, ['scripts/reset-e2e-limits.mjs']);
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer(),
    db = app.get(DatabaseService),
    a = request.agent(server),
    b = request.agent(server),
    ids = [];
  const send = (client, method, path, body) =>
    client[method]('/v1/' + path)
      .set('Origin', 'http://localhost:3000')
      .send(body);
  async function register(client) {
    const key = authenticator(),
      handle = 'theme_' + randomUUID().replaceAll('-', '').slice(0, 20);
    const options = await send(client, 'post', 'auth/registration/options', {
      handle,
      intent: 'create',
    }).expect(201);
    await send(
      client,
      'post',
      'auth/registration/verify',
      key.register(options.body.data),
    ).expect(200);
    const p = (await client.get('/v1/users/me').expect(200)).body.data;
    ids.push(p.id);
    return { key, p };
  }
  let user, saved, revision, media;
  try {
    await t.test(
      'all starter palettes validate and unsafe render values fall back',
      () => {
        for (const p of THEME_PALETTES) {
          assert.ok(isThemeConfig(p.config));
          assert.deepEqual(themeContrastIssues(p.config), [], p.name);
          assert.ok(!themeBackgroundSvg(p.config).includes('<script'));
        }
        const bad = copy(DEFAULT_THEME);
        bad.colors.surface = 'url(javascript:alert(1))';
        assert.equal(isThemeConfig(bad), false);
        assert.deepEqual(safeTheme(bad), DEFAULT_THEME);
        assert.equal(isThemeConfig({}), false);
      },
    );
    await t.test('authentication and request origin are required', async () => {
      await request(server).get('/v1/themes').expect(401);
      user = await register(a);
      await register(b);
      await a.post('/v1/themes').send({}).expect(403);
    });
    await t.test(
      'create and apply do not change profile identity or defaults',
      async () => {
        saved = (
          await send(a, 'post', 'themes', {
            name: 'Quiet Teal',
            description: 'My theme',
            config: copy(THEME_PALETTES[2].config),
          }).expect(201)
        ).body.data;
        assert.equal(saved.revision, 0);
        assert.equal(
          (await a.get('/v1/themes/state')).body.data.activeTheme,
          null,
        );
        let state = (await a.get('/v1/themes/state')).body.data;
        revision = state.themeVersion;
        state = (
          await send(a, 'post', `themes/${saved.id}/apply`, {
            themeVersion: revision,
          }).expect(200)
        ).body.data;
        revision = state.themeVersion;
        assert.equal(state.activeTheme.id, saved.id);
        const me = (await a.get('/v1/users/me')).body.data;
        assert.equal(me.handle, user.p.handle);
        assert.equal(me.activeTheme.id, saved.id);
        assert.equal(me.profileVersion, user.p.profileVersion);
        assert.equal(
          me.onboarding?.backgroundId,
          user.p.onboarding?.backgroundId,
        );
      },
    );
    await t.test(
      'other accounts cannot read, edit, duplicate, apply or remove themes',
      async () => {
        assert.deepEqual((await b.get('/v1/themes')).body.data.items, []);
        await send(b, 'patch', `themes/${saved.id}`, {
          name: 'stolen',
          description: '',
          config: copy(DEFAULT_THEME),
          revision: 0,
        }).expect(404);
        await send(b, 'post', `themes/${saved.id}/duplicate`, {}).expect(404);
        await send(b, 'post', `themes/${saved.id}/apply`, {
          themeVersion: 0,
        }).expect(404);
        await send(b, 'delete', `themes/${saved.id}`, { revision: 0 }).expect(
          409,
        );
      },
    );
    await t.test(
      'strict JSON, contrast and version validation reject executable or inaccessible values',
      async () => {
        for (const mutate of [
          (v) => (v.colors.primaryText = v.colors.surface),
          (v) => (v.colors.surface = 'red;display:none'),
          (v) => (v.version = 2),
          (v) => (v.effects.css = 'url(https://evil.test)'),
          (v) => (v.background.imageId = 'https://evil.test'),
        ]) {
          const value = copy(DEFAULT_THEME);
          mutate(value);
          await send(a, 'post', 'themes', {
            name: 'Invalid',
            description: '',
            config: value,
          }).expect(400);
        }
      },
    );
    await t.test(
      'edit uses optimistic revisions and active config updates safely',
      async () => {
        saved = (
          await send(a, 'patch', `themes/${saved.id}`, {
            name: 'Teal edited',
            description: 'Updated',
            config: copy(THEME_PALETTES[2].config),
            revision: 0,
          }).expect(200)
        ).body.data;
        await send(a, 'patch', `themes/${saved.id}`, {
          name: 'stale',
          description: '',
          config: copy(DEFAULT_THEME),
          revision: 0,
        }).expect(409);
        assert.equal(
          (await a.get('/v1/themes/state')).body.data.activeTheme.name,
          'Quiet Teal',
        );
        await send(a, 'post', `themes/${saved.id}/apply`, {
          themeVersion: revision - 1,
        }).expect(409);
      },
    );
    await t.test(
      'duplicate, delete, undo and restore default preserve the originals',
      async () => {
        const duplicate = (
          await send(a, 'post', `themes/${saved.id}/duplicate`, {}).expect(201)
        ).body.data;
        assert.notEqual(duplicate.id, saved.id);
        const removed = (
          await send(a, 'delete', `themes/${saved.id}`, {
            revision: saved.revision,
          }).expect(200)
        ).body.data;
        assert.equal(
          (await a.get('/v1/themes/state')).body.data.activeTheme,
          null,
        );
        await send(a, 'post', `themes/${saved.id}/restore`, {
          revision: removed.revision,
        }).expect(200);
        assert.equal((await a.get('/v1/themes')).body.data.items.length, 2);
        const state = (await a.get('/v1/themes/state')).body.data;
        const restored = (
          await send(a, 'post', 'themes/default', {
            themeVersion: state.themeVersion,
            backgroundId: 'alpine',
          }).expect(200)
        ).body.data;
        assert.equal(restored.defaultBackgroundId, 'alpine');
        assert.equal(restored.activeTheme, null);
        assert.equal((await a.get('/v1/themes')).body.data.items.length, 2);
      },
    );
    await t.test(
      'background media ownership and retention are enforced',
      async () => {
        await db.user.updateMany({
          where: { id: { in: ids } },
          data: { onboardingCompletedAt: new Date() },
        });
        const bytes = await sharp({
          create: { width: 32, height: 32, channels: 3, background: '#273a4c' },
        })
          .png()
          .toBuffer();
        media = (
          await a
            .post('/v1/media')
            .set('Origin', 'http://localhost:3000')
            .set('Content-Type', 'image/png')
            .send(bytes)
            .expect(201)
        ).body.data;
        const config = copy(DEFAULT_THEME);
        config.background.type = 'image';
        config.background.imageId = media.id;
        await send(b, 'post', 'themes', {
          name: 'Foreign media',
          description: '',
          config,
        }).expect(403);
        const image = (
          await send(a, 'post', 'themes', {
            name: 'Image theme',
            description: '',
            config,
          }).expect(201)
        ).body.data;
        await db.media.update({
          where: { id: media.id },
          data: { createdAt: new Date(Date.now() - 2 * 86400000) },
        });
        await a.get('/v1/media/' + media.id).expect(200);
        await b.get('/v1/media/' + media.id).expect(404);
        await a
          .delete('/v1/media/' + media.id)
          .set('Origin', 'http://localhost:3000')
          .expect(404);
        assert.ok(await db.media.findUnique({ where: { id: media.id } }));
        await send(a, 'patch', `themes/${image.id}`, {
          name: 'Image retained',
          description: '',
          config,
          revision: image.revision,
        }).expect(200);
        const state=(await a.get('/v1/themes/state')).body.data;
        await send(a,'post',`themes/${image.id}/apply`,{themeVersion:state.themeVersion}).expect(200);
        await send(a,'patch',`themes/${image.id}`,{name:'Draft without image',description:'',config:copy(DEFAULT_THEME),revision:1}).expect(200);
        assert.equal((await a.get('/v1/themes/state')).body.data.activeTheme.config.background.imageId,media.id);
        await a.get('/v1/media/'+media.id).expect(200);
        const community=await db.community.findFirstOrThrow({where:{isActive:true}});
        await db.communityMembership.create({data:{userId:user.p.id,communityId:community.id}});
        await send(a,'post','posts',{communityId:community.id,text:'Private background must not be attached',attachmentIds:[media.id]}).expect(403);

      },
    );
    await t.test(
      'fresh login reads the account selection on another session',
      async () => {
        const state = (await a.get('/v1/themes/state')).body.data;
        await send(a, 'post', `themes/${saved.id}/apply`, {
          themeVersion: state.themeVersion,
        }).expect(200);
        const device = request.agent(server),
          opt = (
            await send(
              device,
              'post',
              'auth/authentication/options',
              {},
            ).expect(201)
          ).body.data;
        await send(
          device,
          'post',
          'auth/authentication/verify',
          user.key.authenticate(opt),
        ).expect(200);
        assert.equal(
          (await device.get('/v1/users/me')).body.data.activeTheme.id,
          saved.id,
        );
      },
    );
    await t.test(
      'account quota rejects excessive theme storage without changing selection',
      async () => {
        const row = await db.customTheme.findFirst({
          where: { userId: user.p.id },
        });
        await db.customTheme.update({
          where: { id: row.id },
          data: { byteSize: 2097152 },
        });
        await send(a, 'post', 'themes', {
          name: 'Over quota',
          description: '',
          config: copy(DEFAULT_THEME),
        }).expect(413);
      },
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }
});
