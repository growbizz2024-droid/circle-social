import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { open, type Reader, type CityResponse } from 'maxmind';
import ipaddr from 'ipaddr.js';
import { isIP } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { Request } from 'express';
import type { LoginLocation } from '@circle/shared-types';
import { DatabaseService } from '../database/database.service.js';
import { environment } from '../core/environment.js';
export function publicIp(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 45 ||
    value.includes('%') ||
    !isIP(value)
  )
    return null;
  try {
    const address = ipaddr.process(value);
    return address.range() === 'unicast' ? address.toString() : null;
  } catch {
    return null;
  }
}
export function requestPublicIp(
  req: Pick<Request, 'headers' | 'method' | 'path'> & {
    socket: { remoteAddress?: string };
  },
  secret = environment.GEOIP_PROXY_SECRET,
  now = Date.now(),
): string | null {
  const ip = req.headers['x-circle-client-ip'],
    at = req.headers['x-circle-client-ip-at'],
    signature = req.headers['x-circle-client-ip-signature'];
  if (
    secret &&
    typeof ip === 'string' &&
    typeof at === 'string' &&
    /^\d{13}$/.test(at) &&
    Math.abs(now - Number(at)) <= 30000 &&
    typeof signature === 'string' &&
    /^[a-f0-9]{64}$/.test(signature)
  ) {
    const expected = createHmac('sha256', secret)
      .update(`${req.method}\n${req.path}\n${ip}\n${at}`)
      .digest();
    if (timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      return publicIp(ip);
  }
  // Deliberately ignore Forwarded/X-Forwarded-For and all unsigned location headers.
  return publicIp(req.socket.remoteAddress);
}
const label = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .normalize()
        .replace(/[\p{Cc}\p{Bidi_Control}]/gu, '')
        .trim()
        .slice(0, max)
    : '';
export function coarseLocation(
  record: CityResponse | null,
): LoginLocation | null {
  const countryCode = record?.country?.iso_code;
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return null;
  return {
    city: label(record?.city?.names?.en, 120) || null,
    country: label(record?.country?.names?.en, 80) || countryCode,
    countryCode,
    approximate: true,
  };
}
@Injectable()
export class GeoIpService implements OnModuleInit, OnModuleDestroy {
  private reader: Reader<CityResponse> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async pruneExpired(): Promise<void> {
    await this.db.session.updateMany({
      where: {
        AND: [
          {
            OR: [
              { expiresAt: { lte: new Date() } },
              { revokedAt: { not: null } },
            ],
          },
          {
            OR: [
              { locationCity: { not: null } },
              { locationCountry: { not: null } },
              { locationCountryCode: { not: null } },
            ],
          },
        ],
      },
      data: {
        locationCity: null,
        locationCountry: null,
        locationCountryCode: null,
      },
    });
  }
  async onModuleInit() {
    await this.pruneExpired().catch(() => {});
    this.timer = setInterval(
      () => void this.pruneExpired().catch(() => {}),
      6 * 60 * 60 * 1000,
    );
    this.timer.unref();
    if (environment.NODE_ENV === 'test' && !environment.GEOIP_DATABASE_PATH)
      return;
    const path =
      environment.GEOIP_DATABASE_PATH ??
      resolve(process.cwd(), '../../infrastructure/geoip/dbip-city-lite.mmdb');
    if (!existsSync(path)) return;
    try {
      this.reader = await open<CityResponse>(path);
    } catch {
      this.reader = undefined;
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.reader = undefined;
  }
  lookup(ip: string | null): LoginLocation | null {
    if (!ip || !publicIp(ip) || !this.reader) return null;
    try {
      return coarseLocation(this.reader.get(ip));
    } catch {
      return null;
    }
  }
  fromRequest(req: Request): LoginLocation | null {
    return this.lookup(requestPublicIp(req));
  }
}
