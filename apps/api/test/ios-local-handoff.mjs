// Manual simulator fixture only; never imported by the application.
// Exercises the real signed registration and PKCE grant APIs without iCloud credentials.
import { config } from 'dotenv';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import request from 'supertest';
import { authenticator } from './authenticator.mjs';
config({ path: '.env.test', quiet: true });
const [connectUrl, device] = process.argv.slice(2);
const url = new URL(connectUrl);
const challenge = url.searchParams.get('challenge');
const state = url.searchParams.get('state');
const handle = url.searchParams.get('registerHandle');
if (handle && !/^[a-z0-9_]{3,40}$/.test(handle))
  throw new Error('Invalid test registration handle');
if (
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test') ||
  new URL(process.env.REDIS_URL).pathname !== '/1' ||
  url.origin !== 'http://localhost:3200' ||
  url.pathname !== '/mobile-connect' ||
  !/^[A-Za-z0-9_-]{43}$/.test(challenge ?? '') ||
  !/^[A-Za-z0-9_-]{43}$/.test(state ?? '') ||
  !/^[A-Fa-f0-9-]{36}$/.test(device ?? '')
)
  throw new Error('Requires a local test handoff and explicit simulator UDID');
const origin = url.origin;
const agent = request.agent('http://127.0.0.1:3201');
const post = (path, body) =>
  agent
    .post('/v1/' + path)
    .set('Origin', origin)
    .send(body);
const key = authenticator();
const options = await post(
  'auth/registration/options',
  handle ? { handle, intent: 'create' } : {},
).expect(201);
await post(
  'auth/registration/verify',
  key.register(options.body.data, { origin }),
).expect(200);
const profile = (await agent.get('/v1/users/me').expect(200)).body.data;
const artifact = new URL(
  '../../../artifacts/ios-test-identity.json',
  import.meta.url,
);
fs.mkdirSync(new URL('../../../artifacts/', import.meta.url), {
  recursive: true,
});
fs.writeFileSync(
  artifact,
  JSON.stringify({ id: profile.id, handle: profile.handle }) + '\n',
);
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
console.log(
  'Test identity registered with a signed WebAuthn fixture. PKCE-bound callback delivered. No tokens displayed.',
);
