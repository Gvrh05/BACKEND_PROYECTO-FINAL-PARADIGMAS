import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AuthenticatedUser {
  sub: string;
  email?: string;
  role?: string;
  name?: string;
}

@Injectable()
export class TokenVerifier {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async verify(token: string): Promise<AuthenticatedUser> {
    try {
      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      if (!secret.trim() || typeof token !== 'string' || !token.trim()) {
        throw new Error('Missing token configuration');
      }
      // TODO: switch to RS256/JWKS if Auth Service changes
      const claims = await this.jwt.verifyAsync<Record<string, unknown>>(
        token,
        {
          secret,
          algorithms: ['HS256'],
          issuer: this.config.get<string>('JWT_ISSUER') || undefined,
          audience: this.config.get<string>('JWT_AUDIENCE') || undefined,
        },
      );
      if (typeof claims.sub !== 'string' || !claims.sub.trim()) {
        throw new Error('Missing subject');
      }
      return {
        sub: claims.sub,
        ...(typeof claims.email === 'string' && { email: claims.email }),
        ...(typeof claims.role === 'string' && { role: claims.role }),
        ...(typeof claims.name === 'string' && { name: claims.name }),
      };
    } catch {
      // Do not disclose tokens, cryptographic errors or server configuration.
      throw new UnauthorizedException(
        'Token de autenticación faltante o inválido',
      );
    }
  }
}
