import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JwtAuthGuard
 * Valida los tokens JWT emitidos por el Auth Service externo.
 * Exige token válido en todo el monolito excepto en endpoints decorados con @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: string;

  constructor(private readonly reflector: Reflector) {
    const secret = process.env.JWT_SECRET;
    if (!secret?.trim()) {
      throw new Error(
        'JWT_SECRET es obligatorio y debe coincidir con el servicio de identidad',
      );
    }
    this.secret = secret;
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Token de autenticación faltante o inválido',
      );
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Formato de token no válido');
    }

    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
      if (
        typeof payload === 'string' ||
        typeof payload.sub !== 'string' ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
          payload.sub,
        )
      ) {
        throw new UnauthorizedException('Identidad de token inválida');
      }

      request['user'] = {
        ...payload,
        userId: payload.sub,
        username:
          typeof payload.username === 'string'
            ? payload.username
            : typeof payload.name === 'string'
              ? payload.name
              : '',
        role:
          payload.role === 'PROFESOR'
            ? 'PROFESOR'
            : payload.role === 'ESTUDIANTE'
              ? 'ESTUDIANTE'
              : undefined,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
