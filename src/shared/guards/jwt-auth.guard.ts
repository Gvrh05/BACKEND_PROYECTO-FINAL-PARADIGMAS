import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenVerifier } from '../auth/token-verifier.service';
import type { AuthenticatedUser } from '../auth/token-verifier.service';

export type AuthenticatedRequest = Request & {
  user: Omit<AuthenticatedUser, 'name'>;
};

/**
 * JwtAuthGuard
 * Valida los tokens JWT emitidos por el Auth Service externo de ProfeLink.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    const match = /^Bearer\s+(\S+)$/i.exec(authHeader ?? '');
    if (!match) {
      throw new UnauthorizedException(
        'Token de autenticación faltante o inválido',
      );
    }
    const { sub, email, role } = await this.verifier.verify(match[1]);
    request.user = {
      sub,
      ...(email !== undefined && { email }),
      ...(role !== undefined && { role }),
    };
    return true;
  }
}
