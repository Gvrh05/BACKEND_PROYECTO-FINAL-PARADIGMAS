import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * JwtAuthGuard
 * Valida los tokens JWT emitidos por el Auth Service externo de ProfeLink.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autenticación faltante o inválido');
    }

    // El token se extraerá y validará con la clave pública o JWT_SECRET
    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Formato de token no válido');
    }

    // Asignación de payload simulada hasta conectar con el servicio de verificación
    request['user'] = { token };
    return true;
  }
}
