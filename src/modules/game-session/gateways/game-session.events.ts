import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import type { ParticipantDto } from '../dto/participant.dto';

/** Shared publisher: REST and WS mutations use the same room-scoped events. */
@Injectable()
export class GameSessionEvents {
  private server?: Namespace;

  attach(server: Namespace): void {
    this.server = server;
  }

  toSocket(socketId: string, event: string, payload: unknown): void {
    this.server?.to(socketId).emit(event, payload);
  }

  participantsUpdated(roomCode: string, participants: ParticipantDto[]): void {
    this.server?.to(roomCode).emit('participants-updated', { participants });
  }

  sessionStarted(roomCode: string, startedAt: string): void {
    this.server
      ?.to(roomCode)
      .emit('session-started', { sessionId: roomCode, startedAt });
  }
}
