import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { GameSessionService } from '../services/game-session.service';
import { JoinRoomDto } from '../dto/join-room.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';
import { SOCKET_EVENTS } from '../../../shared/utils/constants';

interface AuthenticatedUser {
  userId: string;
  username: string;
  role?: string;
}

interface SocketData {
  user?: AuthenticatedUser;
}

type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(private readonly gameSessionService: GameSessionService) {}

  /**
   * Valida el token JWT emitido por el microservicio auth al momento de conectar el WebSocket.
   * Rechaza la conexión si no tiene token o si es inválido.
   */
  handleConnection(client: AuthenticatedSocket) {
    const token: unknown =
      client.handshake.auth?.token ||
      (typeof client.handshake.headers?.authorization === 'string' &&
      client.handshake.headers.authorization.startsWith('Bearer ')
        ? client.handshake.headers.authorization.split(' ')[1]
        : null) ||
      client.handshake.query?.access_token ||
      client.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      this.logger.warn(
        `Conexión WS rechazada: token faltante para socket ${client.id}`,
      );
      client.emit('unauthorized', {
        message: 'Token de autenticación requerido para conectar a WebSockets',
      });
      client.disconnect(true);
      return;
    }

    try {
      const secret = process.env.JWT_SECRET || 'secret_key_compartida';
      const payload = jwt.verify(token, secret) as jwt.JwtPayload & {
        sub?: string;
        username?: string;
        name?: string;
        role?: string;
      };
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('JWT subject is required');
      }

      const user: AuthenticatedUser = {
        userId: payload.sub,
        username: payload.username || payload.name || payload.sub,
        role: payload.role,
      };
      client.data.user = user;

      this.logger.log(
        `Cliente WS autenticado exitosamente: ${client.id} (Usuario: ${user.username}, Rol: ${user.role})`,
      );
    } catch {
      this.logger.warn(
        `Conexión WS rechazada: token inválido o expirado para socket ${client.id}`,
      );
      client.emit('unauthorized', { message: 'Token inválido o expirado' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage(SOCKET_EVENTS.JOIN_ROOM)
  handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinRoomDto,
  ) {
    if (!client.data.user) {
      client.emit('unauthorized', { message: 'No autenticado' });
      client.disconnect(true);
      return;
    }
    this.logger.log(
      `Usuario ${client.data.user.username} (Socket ${client.id}) se unió a la sala ${payload.pin} como ${payload.playerName}`,
    );
    return this.gameSessionService.joinRoom(payload);
  }

  @SubscribeMessage(SOCKET_EVENTS.SUBMIT_ANSWER)
  handleSubmitAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SubmitAnswerDto,
  ) {
    if (!client.data.user) {
      client.emit('unauthorized', { message: 'No autenticado' });
      client.disconnect(true);
      return;
    }
    this.logger.log(
      `Usuario ${client.data.user.username} (Socket ${client.id}) envió respuesta para sala ${payload.pin}`,
    );
    return this.gameSessionService.submitAnswer(payload);
  }
}
