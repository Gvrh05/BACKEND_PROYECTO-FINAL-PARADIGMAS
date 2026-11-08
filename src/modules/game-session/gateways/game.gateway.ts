import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { GameSessionService } from '../services/game-session.service';
import { JoinRoomDto } from '../dto/join-room.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';
import { SOCKET_EVENTS } from '../../../shared/utils/constants';

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
  handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ||
      (typeof client.handshake.headers?.authorization === 'string' &&
      client.handshake.headers.authorization.startsWith('Bearer ')
        ? client.handshake.headers.authorization.split(' ')[1]
        : null) ||
      client.handshake.query?.access_token ||
      client.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      this.logger.warn(`Conexión WS rechazada: token faltante para socket ${client.id}`);
      client.emit('unauthorized', { message: 'Token de autenticación requerido para conectar a WebSockets' });
      client.disconnect(true);
      return;
    }

    try {
      const secret = process.env.JWT_SECRET || 'secret_key_compartida';
      const payload = jwt.verify(token, secret) as any;

      client.data.user = {
        userId: payload.sub,
        username: payload.username || payload.name,
        role: payload.role,
      };

      this.logger.log(
        `Cliente WS autenticado exitosamente: ${client.id} (Usuario: ${client.data.user.username}, Rol: ${client.data.user.role})`,
      );
    } catch {
      this.logger.warn(`Conexión WS rechazada: token inválido o expirado para socket ${client.id}`);
      client.emit('unauthorized', { message: 'Token inválido o expirado' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage(SOCKET_EVENTS.JOIN_ROOM)
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinRoomDto) {
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
  handleSubmitAnswer(@ConnectedSocket() client: Socket, @MessageBody() payload: SubmitAnswerDto) {
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
