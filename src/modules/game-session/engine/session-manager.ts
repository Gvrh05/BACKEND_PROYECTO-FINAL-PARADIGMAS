import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { LiveGame } from './live-game';
import { GamePhase } from '../dto/game-state.dto';
import { ParticipantDto } from '../dto/participant.dto';
import { SessionStatus } from '../entities/game-session.entity';

export interface SessionPlayer extends ParticipantDto {
  id: string;
  score: number; // Reserved for Punto 4; not calculated here.
  socketId: string;
  socketIds: Set<string>;
}

export interface PlayerInput {
  userId: string;
  name?: string;
  socketId?: string;
}

export interface ActiveSession {
  pin: string;
  quizId: string;
  hostId: string;
  hostSocketId: string;
  createdAt: Date;
  startedAt?: Date;
  status: SessionStatus;
  phase: GamePhase;
  currentQuestionIndex: number;
  players: Map<string, SessionPlayer>;
  liveGame?: LiveGame;
}

@Injectable()
export class SessionManager {
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly reservations = new Set<string>();

  /** Reserve privately until the service has persisted the session. */
  reserveSession(hostId: string, quizId: string): ActiveSession {
    const pin = this.generatePin();
    this.reservations.add(pin);
    const session: ActiveSession = {
      pin,
      quizId,
      hostId,
      hostSocketId: '',
      createdAt: new Date(),
      status: SessionStatus.LOBBY,
      phase: GamePhase.LOBBY,
      currentQuestionIndex: 0,
      players: new Map(),
    };
    session.players.set(
      hostId,
      this.newPlayer({ userId: hostId, name: 'Anfitrión' }),
    );
    return session;
  }

  publishSession(session: ActiveSession): ActiveSession {
    if (!this.reservations.delete(session.pin)) {
      throw new BadRequestException('La reserva de sala no existe');
    }
    this.sessions.set(session.pin, session);
    return session;
  }

  releaseReservation(pin: string): void {
    this.reservations.delete(pin);
  }

  /** In-memory engine entry point. Persistent callers use the service instead. */
  createSession(hostId: string, quizId: string): ActiveSession {
    return this.publishSession(this.reserveSession(hostId, quizId));
  }

  getSession(pin: string): ActiveSession | undefined {
    return this.sessions.get(pin);
  }

  requireSession(pin: string): ActiveSession {
    const session = this.getSession(pin);
    if (!session) {
      throw new NotFoundException('Sala inexistente');
    }
    return session;
  }

  get activeCount(): number {
    return this.sessions.size;
  }

  addPlayer(
    pin: string,
    input: PlayerInput,
  ): { added: boolean; player: ParticipantDto } {
    const session = this.requireSession(pin);
    const existing = session.players.get(input.userId);
    if (
      session.status === SessionStatus.FINISHED ||
      (!existing && session.status !== SessionStatus.LOBBY)
    ) {
      throw new BadRequestException('La sala ya ha iniciado o finalizado');
    }
    const player = existing ?? this.newPlayer(input);
    if (input.name?.trim()) player.name = input.name.trim();
    if (input.socketId) {
      player.socketIds.add(input.socketId);
      player.socketId = input.socketId;
      player.connected = true;
      if (input.userId === session.hostId)
        session.hostSocketId = input.socketId;
    }
    session.players.set(input.userId, player);
    return { added: !existing, player: this.participant(player) };
  }

  /** socketId makes disconnect safe when old and new connections overlap. */
  removePlayer(pin: string, userId: string, socketId?: string): void {
    const session = this.requireSession(pin);
    const player = session.players.get(userId);
    if (!player) return;
    if (socketId) {
      if (!player.socketIds.delete(socketId)) return;
      if (player.socketIds.size) {
        player.socketId = [...player.socketIds].at(-1)!;
        if (userId === session.hostId) session.hostSocketId = player.socketId;
        return;
      }
    } else {
      player.socketIds.clear();
    }
    player.connected = false;
    player.socketId = '';
    if (userId === session.hostId) session.hostSocketId = '';
    if (session.status === SessionStatus.LOBBY) session.players.delete(userId);
  }

  listPlayers(pin: string): ParticipantDto[] {
    return [...this.requireSession(pin).players.values()].map((player) =>
      this.participant(player),
    );
  }

  assertCanStart(pin: string, hostId: string): ActiveSession {
    const session = this.requireSession(pin);
    if (hostId !== session.hostId)
      throw new ForbiddenException(
        'Solo el anfitrión puede iniciar la partida',
      );
    if (session.status !== SessionStatus.LOBBY)
      throw new BadRequestException('La sala no está en LOBBY');
    return session;
  }

  startSession(
    pin: string,
    hostId: string,
    startedAt = new Date(),
  ): ActiveSession {
    const session = this.assertCanStart(pin, hostId);
    session.status = SessionStatus.IN_PROGRESS;
    session.phase = GamePhase.IN_PROGRESS;
    session.startedAt = startedAt;
    return session;
  }

  removeSession(pin: string): boolean {
    return this.sessions.delete(pin);
  }

  private participant(player: SessionPlayer): ParticipantDto {
    return {
      userId: player.userId,
      name: player.name,
      connected: player.connected,
    };
  }

  private newPlayer(input: PlayerInput): SessionPlayer {
    return {
      id: input.userId,
      userId: input.userId,
      name: input.name?.trim() || 'Participante',
      connected: false,
      score: 0,
      socketId: '',
      socketIds: new Set(),
    };
  }

  private generatePin(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      const pin = randomInt(100000, 1000000).toString();
      if (!this.sessions.has(pin) && !this.reservations.has(pin)) return pin;
    }
    throw new ServiceUnavailableException(
      'No se pudo generar un código único; intenta de nuevo',
    );
  }
}
