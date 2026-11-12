import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CityResponse } from 'maxmind';
vi.mock('../core/environment.js', () => ({
  environment: {
    NODE_ENV: 'test',
    GEOIP_PROXY_SECRET: undefined,
    GEOIP_DATABASE_PATH: undefined,
  },
}));
import { environment } from '../core/environment.js';
import {
  publicIp,
  requestPublicIp,
  coarseLocation,
  GeoIpService,
} from './geoip.service.js';
import type { DatabaseService } from '../database/database.service.js';
describe('private approximate login locations', () => {
  it('accepts public IPv4/IPv6 while excluding private, reserved and mapped private IPs', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.2',
      '172.16.0.1',
      '100.64.0.1',
      '169.254.1.1',
      '192.0.2.1',
      '198.51.100.1',
      '203.0.113.1',
      '0.0.0.0',
      '255.255.255.255',
      '224.0.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '2001:db8::1',
      '::ffff:127.0.0.1',
      'fe80::1%en0',
      '8.8.8.8, 1.1.1.1',
      'not-an-ip',
    ])
      expect(publicIp(ip)).toBeNull();
    expect(publicIp('8.8.8.8')).toBe('8.8.8.8');
    expect(publicIp('::ffff:8.8.8.8')).toBe('8.8.8.8');
    expect(publicIp('2606:4700:4700::1111')).toBe('2606:4700:4700::1111');
  });
  it('ignores spoofed forwarding headers and checks method/path/time on signed handoffs', () => {
    const now = Date.now(),
      key = 'test-proxy-key-'.repeat(4),
      ip = '8.8.8.8',
      at = String(now),
      path = '/v1/auth/authentication/verify';
    const signature = createHmac('sha256', key)
      .update(`POST\n${path}\n${ip}\n${at}`)
      .digest('hex');
    const base = {
      headers: {
        'x-forwarded-for': ip,
        forwarded: 'for=' + ip,
        'x-real-ip': ip,
      },
      socket: { remoteAddress: '127.0.0.1' },
      method: 'POST',
      path,
    };
    expect(requestPublicIp(base, key, now)).toBeNull();
    const req = {
      ...base,
      headers: {
        ...base.headers,
        'x-circle-client-ip': ip,
        'x-circle-client-ip-at': at,
        'x-circle-client-ip-signature': signature,
      },
    };
    expect(requestPublicIp(req, key, now)).toBe(ip);
    expect(requestPublicIp(req, key, now + 30001)).toBeNull();
    expect(requestPublicIp(req, key, now - 30001)).toBeNull();
    expect(
      requestPublicIp({ ...req, path: '/v1/auth/recovery/verify' }, key, now),
    ).toBeNull();
    expect(requestPublicIp({ ...req, method: 'GET' }, key, now)).toBeNull();
    expect(
      requestPublicIp(
        {
          ...req,
          headers: { ...req.headers, 'x-circle-client-ip': '1.1.1.1' },
        },
        key,
        now,
      ),
    ).toBeNull();
    expect(requestPublicIp(req, 'wrong-test-key', now)).toBeNull();
    expect(
      requestPublicIp(
        { ...base, socket: { remoteAddress: '1.1.1.1' } },
        key,
        now,
      ),
    ).toBe('1.1.1.1');
  });
  it('projects only city/country and never coordinates or the raw database record', () => {
    const record = {
      city: { names: { en: 'London\u0000\u202e' } },
      country: { iso_code: 'GB', names: { en: 'United Kingdom' } },
      location: { latitude: 51.5, longitude: -0.1 },
      postal: { code: 'private' },
    } as unknown as CityResponse;
    expect(coarseLocation(record)).toEqual({
      city: 'London',
      country: 'United Kingdom',
      countryCode: 'GB',
      approximate: true,
    });
    expect(coarseLocation(null)).toBeNull();
  });
  it('fails softly with an absent or corrupt local database', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'circle-geoip-'));
    const previous = environment.GEOIP_DATABASE_PATH;
    const db = {
      session: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as DatabaseService;
    const service = new GeoIpService(db);
    try {
      environment.GEOIP_DATABASE_PATH = join(dir, 'invalid.mmdb');
      await writeFile(environment.GEOIP_DATABASE_PATH, 'not a database');
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(service.lookup('8.8.8.8')).toBeNull();
    } finally {
      service.onModuleDestroy();
      environment.GEOIP_DATABASE_PATH = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
