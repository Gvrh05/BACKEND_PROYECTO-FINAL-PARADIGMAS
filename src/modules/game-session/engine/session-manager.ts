import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ConflictException,
  HttpException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomInt, randomUUID, randomBytes, createHash } from 'node:crypto';
import type { LiveGame } from './live-game';
import { GamePhase } from '../dto/game-state.dto';
import { ParticipantDto } from '../dto/participant.dto';
import { SessionStatus } from '../entities/game-session.entity';

export interface SessionPlayer extends ParticipantDto {
  guest?: boolean;
  id: string;
  score: number; // Reserved for Punto 4; not calculated here.
  socketId: string;
  socketIds: Set<string>;
}

export interface PlayerInput {
  guest?: boolean;
  userId: string;
  name?: string;
  socketId?: string;
}

export interface ActiveSession {
  id: string;
  invitationId: string;
  name: string;
  expiresAt: number;
  acceptingGuests: boolean;
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
export class SessionManager implements OnModuleDestroy {
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly reservations = new Set<string>();
  private readonly credentials = new Map<
    string,
    {
      sessionId: string;
      roomCode: string;
      sub: string;
      name: string;
      expiresAt: number;
    }
  >();
  private readonly limits = new Map<string, { count: number; until: number }>();
  private readonly cleanup = setInterval(() => this.sweep(), 60000).unref();

  onModuleDestroy() {
    clearInterval(this.cleanup);
    this.credentials.clear();
    this.limits.clear();
  }

  private sweep() {
    const now = Date.now();
    for (const [hash, value] of this.credentials)
      if (
        value.expiresAt <= now ||
        this.sessions.get(value.roomCode)?.id !== value.sessionId
      )
        this.credentials.delete(hash);
    for (const [key, value] of this.limits)
      if (value.until <= now) this.limits.delete(key);
  }

  rateLimit(key: string, maximum = 60) {
    this.sweep();
    const value = this.limits.get(key) ?? {
      count: 0,
      until: Date.now() + 60000,
    };
    if (this.limits.size >= 10000 && !this.limits.has(key))
      throw new HttpException('Demasiadas solicitudes', 429);
    this.limits.set(key, value);
    if (++value.count > maximum)
      throw new HttpException('Demasiadas solicitudes', 429);
  }

  invitation(invitationId: string) {
    const session = [...this.sessions.values()].find(
      (value) =>
        value.invitationId === invitationId &&
        value.expiresAt > Date.now() &&
        value.status !== SessionStatus.FINISHED,
    );
    if (!session)
      throw new NotFoundException('Invitación inexistente o caducada');
    return session;
  }

  createGuest(invitationId: string, username: unknown) {
    const session = this.invitation(invitationId);
    this.rateLimit(`room:${session.id}`, 30);
    if (session.status !== SessionStatus.LOBBY || !session.acceptingGuests)
      throw new BadRequestException('La sala ya inició');
    if (
      typeof username !== 'string' ||
      !username.trim() ||
      username.trim().length > 80
    )
      throw new BadRequestException('Nombre requerido de 1 a 80 caracteres');
    const name = username.trim();
    if (
      [...session.players.values()].some(
        (player) =>
          player.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      throw new ConflictException('El nombre ya está en uso');
    if (session.players.size >= 500) throw new HttpException('Sala llena', 429);
    const sub = randomUUID();
    const guestToken = randomBytes(32).toString('base64url');
    this.credentials.set(this.hash(guestToken), {
      sessionId: session.id,
      roomCode: session.pin,
      sub,
      name,
      expiresAt: session.expiresAt,
    });
    this.addPlayer(session.pin, { userId: sub, name, guest: true });
    return {
      participantId: sub,
      username: name,
      roomCode: session.pin,
      guestToken,
      invitationId,
    };
  }

  verifyGuest(token: unknown) {
    if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token))
      throw new UnauthorizedException('Credencial invitado inválida');
    const hash = this.hash(token);
    const credential = this.credentials.get(hash);
    const session = credential && this.sessions.get(credential.roomCode);
    if (
      !credential ||
      !session ||
      session.id !== credential.sessionId ||
      session.status === SessionStatus.FINISHED ||
      credential.expiresAt <= Date.now()
    ) {
      this.credentials.delete(hash);
      throw new UnauthorizedException('Credencial invitado caducada');
    }
    return { ...credential };
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Reserve privately until the service has persisted the session. */
  reserveSession(hostId: string, quizId: string): ActiveSession {
    const pin = this.generatePin();
    this.reservations.add(pin);
    const session: ActiveSession = {
      id: randomUUID(),
      invitationId: randomBytes(32).toString('base64url'),
      name: 'Partida',
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      acceptingGuests: true,
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
    if (session.status === SessionStatus.LOBBY && !player.guest)
      session.players.delete(userId);
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
    for (const [hash, value] of this.credentials)
      if (value.roomCode === pin) this.credentials.delete(hash);
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
      guest: input.guest,
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
