import {
  Injectable,
  Inject,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { requestToken } from '../auth/request-token.js';
import { environment } from '../core/environment.js';
export type IdentityRequest = Request & {
  identity?: Awaited<ReturnType<AuthService['session']>>;
};
export function identity(req: IdentityRequest) {
  if (!req.identity) throw new UnauthorizedException();
  return req.identity;
}
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<IdentityRequest>();
    req.identity = await this.auth.session(requestToken(req));
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin !== environment.WEB_ORIGIN
    )
      throw new ForbiddenException();
    return true;
  }
}
