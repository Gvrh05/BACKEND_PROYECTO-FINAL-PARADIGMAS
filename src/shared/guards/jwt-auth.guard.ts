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
  constructor(private readonly reflector: Reflector) {}

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
      throw new UnauthorizedException('Token de autenticación faltante o inválido');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Formato de token no válido');
    }

    try {
      const secret = process.env.JWT_SECRET || 'secret_key_compartida';
      const payload = jwt.verify(token, secret) as any;

      request['user'] = {
        userId: payload.sub,
        username: payload.username || payload.name,
        role: payload.role,
        ...payload,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
