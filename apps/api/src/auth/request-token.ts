import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { environment } from '../core/environment.js';
export const sessionCookieName =
  environment.NODE_ENV === 'production'
    ? '__Host-circle_session'
    : 'circle_session';
export function requestToken(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[
    sessionCookieName
  ];
  const cookie = typeof value === 'string' ? value : undefined;
  if (req.headers.authorization && cookie)
    throw new BadRequestException('Ambiguous session');
  if (req.headers.authorization) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
      req.headers.authorization,
    );
    return match?.[1];
  }
  return cookie;
}
