import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
    let claims: Record<string, unknown>;
    try {
      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      if (!secret.trim() || typeof token !== 'string' || !token.trim()) {
        throw new Error('Missing token configuration');
      }
      // TODO: switch to RS256/JWKS if Auth Service changes
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret,
        algorithms: ['HS256'],
        issuer: this.config.get<string>('JWT_ISSUER') || undefined,
        audience: this.config.get<string>('JWT_AUDIENCE') || 'kahoot-api',
      });
      if (
        typeof claims.sub !== 'string' ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
          claims.sub,
        ) ||
        typeof claims.exp !== 'number' ||
        claims.purpose !== 'account' ||
        !['MASTER', 'PROFESOR'].includes(String(claims.role)) ||
        !Number.isInteger(claims.credentialVersion) ||
        Number(claims.credentialVersion) < 0
      ) {
        throw new Error('Missing subject');
      }
    } catch {
      // Do not disclose tokens, cryptographic errors or server configuration.
      throw new UnauthorizedException(
        'Token de autenticación faltante o inválido',
      );
    }
    const base = (
      this.config.get<string>('AUTH_SERVICE_URL') || 'http://localhost:3001'
    )
      .replace(/\/$/, '')
      .replace(/\/auth$/, '');
    let response: Response;
    try {
      response = await fetch(`${base}/auth/session/validate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      throw new ServiceUnavailableException('Auth no disponible');
    }
    if (response.status === 401 || response.status === 403)
      throw new UnauthorizedException('Cuenta no válida');
    if (!response.ok)
      throw new ServiceUnavailableException('Auth no disponible');
    let profile: Record<string, unknown>;
    try {
      profile = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new ServiceUnavailableException('Respuesta Auth inválida');
    }
    if (
      !profile ||
      profile.id !== claims.sub ||
      profile.active !== true ||
      profile.role !== claims.role ||
      profile.credentialVersion !== claims.credentialVersion ||
      typeof profile.username !== 'string'
    )
      throw new UnauthorizedException('Cuenta no válida');
    return {
      sub: claims.sub,
      role: profile.role as string,
      name: profile.username,
    };
  }
}
