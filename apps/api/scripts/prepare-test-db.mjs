import { config } from 'dotenv';
import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
config({ path: '.env.test', quiet: true });
const url = new URL(process.env.DATABASE_URL);
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  url.pathname !== '/circle_social_test'
)
  throw new Error('Only the local Circle.social test database can be prepared');
const admin = new URL(url);
admin.pathname = '/postgres';
const client = new Client({
  connectionString: admin.toString(),
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  if (
    !(
      await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [
        'circle_social_test',
      ])
    ).rowCount
  )
    await client.query('CREATE DATABASE circle_social_test');
} catch {
  console.error('Could not prepare the local test database');
  process.exitCode = 1;
} finally {
  await client.end();
}
if (!process.exitCode)
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DOTENV_CONFIG_PATH: '.env.test' },
  });
