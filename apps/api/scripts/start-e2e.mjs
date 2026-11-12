import { config } from 'dotenv';
config({ path: new URL('../.env.test', import.meta.url), quiet: true });
if (
  process.env.NODE_ENV !== 'test' ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test') ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error('E2E server requires isolated test infrastructure');
await import('../dist/main.js');
