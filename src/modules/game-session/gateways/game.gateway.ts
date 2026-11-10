import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Namespace, Socket } from 'socket.io';
import { TokenVerifier } from '../../../shared/auth/token-verifier.service';
import type { AuthenticatedUser } from '../../../shared/auth/token-verifier.service';
import { RoomCodeDto } from '../dto/room-code.dto';
import { GameSessionService } from '../services/game-session.service';
import { GameSessionEvents } from './game-session.events';
import { getMeter } from '../../../tracing';

interface GameSocketData {
  user?: Pick<AuthenticatedUser, 'sub' | 'name'>;
  authentication?: Promise<void>;
  operations?: Promise<void>;
  roomCode?: string;
}
type GameSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  GameSocketData
>;

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*' },
  namespace: '/game',
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly wsEvents =
    getMeter('game-session').createCounter('ws_events_total');
  @WebSocketServer()
  server: Namespace;

  constructor(
    private readonly sessions: GameSessionService,
    private readonly verifier: TokenVerifier,
    private readonly events: GameSessionEvents,
  ) {}

  afterInit(server: Namespace): void {
    this.events.attach(server);
  }

  handleConnection(client: GameSocket): void {
    // Store the promise synchronously: messages arriving during verify must wait.
    client.data.authentication = this.authenticate(client);
  }

  private async authenticate(client: GameSocket): Promise<void> {
    try {
      const user = await this.verifier.verify(
        client.handshake.auth.token as string,
      );
      if (!client.connected) return;
      client.data.user = {
        sub: user.sub,
        ...(user.name && { name: user.name }),
      };
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('join-session')
  join(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    return this.enqueue(client, 'join', async () => {
      const user = await this.authenticated(client);
      const roomCode = await this.roomCode(payload);
      const snapshot = this.sessions.getSessionByCode(roomCode);
      const existing = snapshot.participants.find(
        (player) => player.userId === user.sub,
      );
      this.sessions.joinSession({
        roomCode,
        userId: user.sub,
        name: existing?.name ?? user.name,
        socketId: client.id,
      });
      const previousRoom = client.data.roomCode;
      if (previousRoom && previousRoom !== roomCode) {
        await client.leave(previousRoom);
        this.removeFromRoom(previousRoom, user.sub, client.id);
      }
      await client.join(roomCode);
      client.data.roomCode = roomCode;
      this.events.toSocket(
        client.id,
        'session-state',
        this.sessions.getSessionByCode(roomCode),
      );
      // The service already notified existing members; the joining socket gets a snapshot.
    });
  }

  @SubscribeMessage('start-session')
  start(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    return this.enqueue(client, 'start', async () => {
      const user = await this.authenticated(client);
      const roomCode = await this.roomCode(payload);
      await this.sessions.startSession(roomCode, user.sub);
    });
  }

  async handleDisconnect(client: GameSocket): Promise<void> {
    this.wsEvents.add(1, { event: 'disconnect' });
    // Drain an in-flight join before removing that socket's membership.
    await client.data.operations;
    const { roomCode, user } = client.data;
    if (roomCode && user) this.removeFromRoom(roomCode, user.sub, client.id);
    delete client.data.roomCode;
  }

  private removeFromRoom(
    roomCode: string,
    userId: string,
    socketId: string,
  ): void {
    try {
      this.sessions.removePlayer(roomCode, userId, socketId);
    } catch (error) {
      // A future game-ending hook may have removed the room before disconnect.
      if (!(error instanceof NotFoundException)) throw error;
    }
  }

  private async authenticated(client: GameSocket) {
    await client.data.authentication;
    if (!client.connected || !client.data.user)
      throw new UnauthorizedException('No autenticado');
    // Recheck expiry/config on each message; a long-lived socket is not a new trust boundary.
    const verified = await this.verifier.verify(
      client.handshake.auth.token as string,
    );
    if (!client.connected || verified.sub !== client.data.user.sub)
      throw new UnauthorizedException('No autenticado');
    return client.data.user;
  }

  private async roomCode(payload: unknown): Promise<string> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new WsException({
        code: 'INVALID_ROOM_CODE',
        message: 'El código de sala debe tener 6 dígitos',
      });
    }
    const dto = plainToInstance(RoomCodeDto, payload);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length) {
      throw new WsException({
        code: 'INVALID_ROOM_CODE',
        message: 'Envía únicamente roomCode con 6 dígitos',
      });
    }
    return dto.roomCode;
  }

  private enqueue(
    client: GameSocket,
    operation: 'join' | 'start',
    action: () => Promise<void>,
  ): Promise<void> {
    this.wsEvents.add(1, { event: operation });
    const next = (client.data.operations ?? Promise.resolve())
      .then(action)
      .catch((error: unknown) => this.sendError(client, operation, error));
    client.data.operations = next;
    return next;
  }

  private sendError(
    client: GameSocket,
    operation: 'join' | 'start',
    error: unknown,
  ): void {
    let payload = {
      code: 'INTERNAL_ERROR',
      message: 'No se pudo completar la operación',
    };
    if (error instanceof WsException) {
      const detail = error.getError();
      if (
        typeof detail === 'object' &&
        'code' in detail &&
        'message' in detail
      ) {
        payload = {
          code: String(detail.code),
          message: String(detail.message),
        };
      }
    } else if (error instanceof UnauthorizedException) {
      payload = {
        code: 'UNAUTHENTICATED',
        message: 'Token inválido o sesión no autenticada',
      };
    } else if (error instanceof ForbiddenException) {
      payload = { code: 'FORBIDDEN', message: error.message };
    } else if (error instanceof NotFoundException) {
      payload = { code: 'SESSION_NOT_FOUND', message: error.message };
    } else if (error instanceof BadRequestException) {
      payload = {
        code:
          operation === 'join'
            ? 'SESSION_ALREADY_STARTED'
            : 'INVALID_SESSION_STATUS',
        message: error.message,
      };
    }
    this.events.toSocket(client.id, 'error', payload);
  }
}
