import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenVerifier } from './token-verifier.service';
import type { AuthenticatedUser } from './token-verifier.service';

export type AuthenticatedRequest = Request & {
  user: Omit<AuthenticatedUser, 'name'>;
};

/** Punto 3 shares this verifier with WS, including issuer/audience and DEV subjects. */
@Injectable()
export class GameSessionAuthGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match)
      throw new UnauthorizedException(
        'Token de autenticación faltante o inválido',
      );
    const { sub, email, role } = await this.verifier.verify(match[1]);
    request.user = {
      sub,
      ...(email !== undefined && { email }),
      ...(role !== undefined && { role }),
    };
    return true;
  }
}
