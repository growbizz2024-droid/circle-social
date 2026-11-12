import { parseEnvironment } from '@circle/config';
import { handleSchema, paginationSchema } from '@circle/validation';
import { hashToken } from '../auth/tokens.js';
describe('shared validation and environment boundaries', () => {
  it('rejects invalid or reserved formatting and oversized pages', () => {
    expect(handleSchema.safeParse('INVALID!').success).toBe(false);
    expect(handleSchema.safeParse('person_123').success).toBe(true);
    expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
  });
  it('does not leak input secrets in environment errors', () => {
    expect(() =>
      parseEnvironment({ DATABASE_URL: 'private-secret', REDIS_URL: 'bad' }),
    ).toThrow('Invalid environment settings: DATABASE_URL, REDIS_URL');
  });
  it('requires HTTPS and a real relying party in production', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/x',
        REDIS_URL: 'redis://localhost/0',
      }),
    ).toThrow();
  });
  it('hashes bearer tokens before persistence', () => {
    expect(hashToken('opaque')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken('opaque')).not.toBe(hashToken('different'));
  });
});
