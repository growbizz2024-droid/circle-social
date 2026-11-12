// Manual simulator-only Theme Studio fixture. Does not run in the application.
import { config } from 'dotenv';
config({ path: '.env.test', quiet: true });
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { writeFileSync,readFileSync,existsSync } from 'node:fs';
import request from 'supertest';
import { authenticator } from './authenticator.mjs';
const device = process.argv[2];
if (
  process.env.NODE_ENV !== 'test' ||
  new URL(process.env.DATABASE_URL).pathname !== '/circle_social_test' ||
  new URL(process.env.REDIS_URL).pathname !== '/1' ||
  !/^[A-Fa-f0-9-]{36}$/.test(device ?? '')
)
  throw new Error(
    'Requires isolated test infrastructure and explicit simulator UDID',
  );
const { DatabaseService } =
  await import('../dist/database/database.service.js');
const db = new DatabaseService();
const origin = 'http://localhost:3200',
  agent = request.agent('http://127.0.0.1:3201');
const post = (path, body) =>
  agent
    .post('/v1/' + path)
    .set('Origin', origin)
    .send(body);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  if (url.pathname !== '/mobile-connect') {
    res.writeHead(404).end();
    return;
  }
  const handle = url.searchParams.get('registerHandle'),
    challenge = url.searchParams.get('challenge'),
    state = url.searchParams.get('state');
  if (
    !/^[a-z0-9_]{3,40}$/.test(handle ?? '') ||
    ![state, challenge].every((s) => /^[A-Za-z0-9_-]{43}$/.test(s ?? ''))
  ) {
    res.writeHead(400).end();
    return;
  }
  res.setHeader('Content-Type', 'text/plain');
  res.end(
    'Circle.social isolated native Theme Studio QA. Completing signed test handoff.',
  );
  server.close();
  try {
    const priorPath='/private/tmp/circle-theme-qa-identity.json';
    if(existsSync(priorPath)){const prior=JSON.parse(readFileSync(priorPath,'utf8'));const disposable=await db.user.findUnique({where:{id:prior.id},select:{handle:true}});if(disposable?.handle===handle&&prior.handle===handle)await db.user.delete({where:{id:prior.id}});}
    const key = authenticator();
    const opt = (
      await post('auth/registration/options', {
        handle,
        intent: 'create',
      }).expect(201)
    ).body.data;
    await post(
      'auth/registration/verify',
      key.register(opt, { origin }),
    ).expect(200);
    const user = (await agent.get('/v1/users/me').expect(200)).body.data;
    // Deliberately seed a completed disposable test identity; onboarding is tested elsewhere.
    await db.user.update({
      where: { id: user.id },
      data: {
        onboardingCompletedAt: new Date(),
        onboarding: {
          create: {
            gender: null,
            vibe: 'BOLD',
            backgroundId: 'ember',
            interests: [],
          },
        },
      },
    });
    const { code } = (
      await post('auth/mobile/authorize', { challenge }).expect(200)
    ).body.data;
    execFileSync(
      'xcrun',
      [
        'simctl',
        'openurl',
        device,
        `circlesocial://auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      ],
      { stdio: 'ignore' },
    );
    writeFileSync(
      '/private/tmp/circle-theme-qa-identity.json',
      JSON.stringify({ id: user.id, handle }),
      { mode: 0o600 },
    );
    console.log(
      'Isolated native theme QA identity seeded and PKCE handoff delivered. No credentials displayed.',
    );
  } catch (error) {
    console.error('Native QA fixture failed:', error.message);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
});
server.listen(3200, '::1', () =>
  console.log('Waiting for the QA simulator browser on localhost:3200.'),
);
server.setTimeout(120000);
