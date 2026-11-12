import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
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
await test('connected feed actions enforce ownership, privacy and real state', async (t) => {
  execFileSync(process.execPath, ['scripts/reset-e2e-limits.mjs']);
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const db = app.get(DatabaseService),
    server = app.getHttpServer(),
    ids = [];
  const origin = 'http://localhost:3000';
  const send = (agent, method, path, body) =>
    agent[method]('/v1/' + path)
      .set('Origin', origin)
      .send(body);
  const clients = [request.agent(server), request.agent(server)];
  try {
    for (const agent of clients) {
      const handle = 'feed_' + randomUUID().replaceAll('-', '').slice(0, 20),
        key = authenticator();
      const options = await send(agent, 'post', 'auth/registration/options', {
        handle,
        intent: 'create',
      }).expect(201);
      await send(
        agent,
        'post',
        'auth/registration/verify',
        key.register(options.body.data),
      ).expect(200);
      const user = (await agent.get('/v1/users/me').expect(200)).body.data;
      ids.push(user.id);
    }
    const [a, b] = clients;
    await a.get('/v1/feed').expect(403);
    await db.user.updateMany({
      where: { id: { in: ids } },
      data: { onboardingCompletedAt: new Date() },
    });
    const community = await db.community.findFirstOrThrow({
      where: { isActive: true },
    });
    await send(a, 'post', 'posts', {
      communityId: community.id,
      text: 'Hello',
    }).expect(403);
    for (const agent of clients)
      await send(agent, 'put', `communities/${community.id}/membership`, {
        active: true,
      }).expect(200);
    let post;
    await t.test(
      'publishing validates content and returns only public projection',
      async () => {
        await send(a, 'post', 'posts', {
          communityId: community.id,
          text: '',
          mediaUrls: [],
        }).expect(400);
        await send(a, 'post', 'posts', {
          communityId: community.id,
          text: 'bad',
          mediaUrls: ['https://example.com/image.jpg'],
        }).expect(400);
        post = (
          await send(a, 'post', 'posts', {
            communityId: community.id,
            text: 'A real conversation about technology.',
            interests: ['technology'],
          }).expect(201)
        ).body.data;
        assert.equal(post.counts.likes, 0);
        assert.equal(post.author.id, undefined);
        assert.equal(post.author.location, undefined);
        assert.equal(
          (await b.get('/v1/feed').expect(200)).body.data.items.some(
            (p) => p.id === post.id,
          ),
          true,
        );
      },
    );
    await t.test(
      'reactions are idempotent and saves remain private',
      async () => {
        for (const kind of ['like', 'repost', 'save'])
          for (let i = 0; i < 2; i++)
            await send(b, 'put', `posts/${post.id}/${kind}`, {
              active: true,
            }).expect(200);
        const p = (await b.get('/v1/posts/' + post.id).expect(200)).body.data;
        assert.equal(p.counts.likes, 1);
        assert.equal(p.counts.reposts, 1);
        assert.equal(p.saved, true);
        assert.equal(
          (await a.get('/v1/feed?tab=saved').expect(200)).body.data.items
            .length,
          0,
        );
        assert.equal(
          (await b.get('/v1/feed?tab=saved').expect(200)).body.data.items[0].id,
          post.id,
        );
        await send(b, 'post', `posts/${post.id}/comments`, {
          text: 'Lovely thought.',
        }).expect(200);
        assert.equal(
          (await a.get(`/v1/posts/${post.id}/comments`).expect(200)).body
            .data[0].text,
          'Lovely thought.',
        );
      },
    );
    await t.test(
      'following, search and notifications are connected and private',
      async () => {
        assert.equal(
          (await b.get('/v1/feed?tab=following').expect(200)).body.data.items
            .length,
          0,
        );
        await send(b, 'put', `profiles/${post.author.handle}/follow`, {
          active: true,
        }).expect(200);
        assert.equal(
          (await b.get('/v1/feed?tab=following').expect(200)).body.data.items[0]
            .id,
          post.id,
        );
        assert.equal(
          (await b.get('/v1/feed?tab=discover&q=technology').expect(200)).body
            .data.items[0].id,
          post.id,
        );
        const activity = (await a.get('/v1/activity').expect(200)).body.data;
        assert.equal(activity.unreadCount, 4);
        assert.equal(
          (await b.get('/v1/activity').expect(200)).body.data.unreadCount,
          0,
        );
        await send(b, 'post', 'activity/read', {
          ids: activity.items.map((x) => x.id),
        }).expect(200);
        assert.equal(
          (await a.get('/v1/activity').expect(200)).body.data.unreadCount,
          4,
        );
        await send(a, 'post', 'activity/read', {
          ids: activity.items.map((x) => x.id),
        }).expect(200);
        assert.equal(
          (await a.get('/v1/activity').expect(200)).body.data.unreadCount,
          0,
        );
      },
    );
    await t.test(
      'removal is owner-only, hidden immediately, and undoable',
      async () => {
        await send(b, 'delete', 'posts/' + post.id).expect(404);
        await send(a, 'delete', 'posts/' + post.id).expect(200);
        await b.get('/v1/posts/' + post.id).expect(404);
        await send(b, 'put', `posts/${post.id}/like`, { active: false }).expect(
          404,
        );
        await send(b, 'post', `posts/${post.id}/restore`, {}).expect(404);
        await send(a, 'post', `posts/${post.id}/restore`, {}).expect(200);
        await b.get('/v1/posts/' + post.id).expect(200);
        await db.communityMembership.update({
          where: {
            userId_communityId: { userId: ids[0], communityId: community.id },
          },
          data: { role: 'OWNER' },
        });
        await send(a, 'put', `communities/${community.id}/membership`, {
          active: false,
        }).expect(409);
      },
    );
    await t.test(
      'authenticated uploads validate bytes, isolate drafts, and attach atomically',
      async () => {
        const upload = (agent, bytes, type) =>
          agent
            .post('/v1/media')
            .set('Origin', origin)
            .set('Content-Type', type)
            .send(bytes);
        await request(server)
          .post('/v1/media')
          .set('Origin', origin)
          .set('Content-Type', 'image/jpeg')
          .send(Buffer.from('bad'))
          .expect(401);
        await upload(
          a,
          Buffer.from('<svg onload="alert(1)"/>'),
          'image/jpeg',
        ).expect(400);
        const original = readFileSync('../../assets/communities/bhasar.jpg');
        const image = (await upload(a, original, 'image/jpeg').expect(201)).body
          .data;
        assert.equal(image.kind, 'IMAGE');
        assert.equal(image.bytes, undefined);
        await b.get(image.url).expect(404);
        const bytes = await a.get(image.url).expect(200);
        assert.equal((await sharp(bytes.body).metadata()).format, 'jpeg');
        await send(b, 'post', 'posts', {
          communityId: community.id,
          text: 'Stolen',
          attachmentIds: [image.id],
        }).expect(403);
        const withImage = (
          await send(a, 'post', 'posts', {
            communityId: community.id,
            text: 'A photo',
            attachmentIds: [image.id],
          }).expect(201)
        ).body.data;
        assert.equal(withImage.attachments[0].id, image.id);
        await b.get(image.url).expect(200);
        await send(a, 'delete', 'media/' + image.id).expect(404);
        await send(a, 'post', 'posts', {
          communityId: community.id,
          text: 'Reused',
          attachmentIds: [image.id],
        }).expect(403);
        const wav = Buffer.alloc(44 + 32000);
        wav.write('RIFF');
        wav.writeUInt32LE(wav.length - 8, 4);
        wav.write('WAVEfmt ', 8);
        wav.writeUInt32LE(16, 16);
        wav.writeUInt16LE(1, 20);
        wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(16000, 24);
        wav.writeUInt32LE(32000, 28);
        wav.writeUInt16LE(2, 32);
        wav.writeUInt16LE(16, 34);
        wav.write('data', 36);
        wav.writeUInt32LE(32000, 40);
        const audio = (await upload(a, wav, 'audio/wav').expect(201)).body.data;
        const nativeAudio = (
          await upload(
            a,
            readFileSync('test/fixtures/voice.m4a'),
            'audio/mp4',
          ).expect(201)
        ).body.data;
        assert.equal(nativeAudio.kind, 'AUDIO');
        assert.ok(
          nativeAudio.durationSeconds >= 0.9 && nativeAudio.durationSeconds < 2,
        );
        assert.equal(audio.kind, 'AUDIO');
        assert.equal(audio.durationSeconds, 1);
        await send(a, 'post', 'posts', {
          communityId: community.id,
          text: '',
          attachmentIds: [audio.id],
        }).expect(201);
        await b
          .get(audio.url)
          .set('Range', 'bytes=0-43')
          .expect(206)
          .expect('Content-Range', `bytes 0-43/${wav.length}`);
        await b.get(audio.url).set('Range', 'bytes=999999-').expect(416);
        const invalidDuration = Buffer.from(wav);
        invalidDuration.writeUInt32LE(100, 24);
        invalidDuration.writeUInt32LE(200, 28);
        await upload(a, invalidDuration, 'audio/wav').expect(400);
        await upload(
          a,
          Buffer.alloc(12 * 1024 * 1024 + 1),
          'image/jpeg',
        ).expect(413);
        const concurrent = (await upload(a, original, 'image/jpeg').expect(201))
          .body.data;
        const results = await Promise.all([
          send(a, 'post', 'posts', {
            communityId: community.id,
            text: 'First publish',
            attachmentIds: [concurrent.id],
          }),
          send(a, 'post', 'posts', {
            communityId: community.id,
            text: 'Second publish',
            attachmentIds: [concurrent.id],
          }),
        ]);
        assert.equal(results.filter((r) => r.status === 201).length, 1);
        assert.ok(results.some((r) => [403, 409].includes(r.status)));
        const expired = (await upload(a, original, 'image/jpeg').expect(201))
          .body.data;
        await db.media.update({
          where: { id: expired.id },
          data: { createdAt: new Date(Date.now() - 86400001) },
        });
        await a.get(expired.url).expect(404);
        await send(a, 'post', 'posts', {
          communityId: community.id,
          text: 'Expired',
          attachmentIds: [expired.id],
        }).expect(403);
        const draft = (await upload(a, original, 'image/jpeg').expect(201)).body
          .data;
        await send(b, 'delete', 'media/' + draft.id).expect(404);
        await send(a, 'delete', 'media/' + draft.id).expect(200);
        await a.get(draft.url).expect(404);
        await send(a, 'delete', 'posts/' + withImage.id).expect(200);
        await b.get(image.url).expect(404);
      },
    );
    await t.test(
      'discovery and community details use genuine public counts',
      async () => {
        const discover = (await b.get('/v1/discover?q=technology').expect(200))
          .body.data;
        assert.ok(
          discover.topics.some((t) => t.id === 'technology' && t.posts >= 1),
        );
        const detail = (
          await b.get(`/v1/communities/${community.id}/detail`).expect(200)
        ).body.data;
        assert.ok(detail.memberCount >= 2);
        assert.equal(detail.joined, true);
        assert.ok(detail.postCount >= 1);
        assert.equal(detail.memberships, undefined);
      },
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
    execFileSync(process.execPath, ['scripts/reset-e2e-limits.mjs']);
  }
});
