// Test harness only. Reset exact local test counters between serial browser journeys.
import { config } from 'dotenv';
import Redis from 'ioredis';
config({ path: '.env.test', quiet: true });
if (
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test') ||
  new URL(process.env.REDIS_URL).pathname !== '/1'
)
  throw new Error(
    'Refusing to reset rate limits outside isolated test infrastructure',
  );
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  keyPrefix: 'circle:',
});
try {
  await redis.del(
    'rate:http:127.0.0.1',
    'rate:http:::1',
    'rate:auth:127.0.0.1',
    'rate:auth:::1',
  );
} finally {
  await redis.quit();
}
