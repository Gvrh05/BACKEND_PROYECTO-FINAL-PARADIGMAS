import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionManager } from '../engine/session-manager';
import type { ActiveSession, PlayerInput } from '../engine/session-manager';
import { JoinRoomDto } from '../dto/join-room.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';
import {
  GameSessionEntity,
  SessionStatus,
} from '../entities/game-session.entity';
import { QuizzesService } from '../../quizzes/services/quizzes.service';
import { GameSessionEvents } from '../gateways/game-session.events';
import { getMeter, getTracer } from '../../../tracing';

@Injectable()
export class GameSessionService {
  private readonly locks = new Map<string, Promise<void>>();
  private readonly tracer = getTracer('game-session');
  private readonly meter = getMeter('game-session');
  private readonly activeSessions = this.meter.createGauge('sessions_active');
  private readonly participants = this.meter.createHistogram(
    'participants_per_session',
  );

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly quizzesService: QuizzesService,
    @InjectRepository(GameSessionEntity)
    private readonly sessions: Repository<GameSessionEntity>,
    private readonly events: GameSessionEvents,
  ) {}

  async createSession(hostId: string, quizId: string) {
    return this.tracer.startActiveSpan('createSession', async (span) => {
      try {
        return await this.createSessionCore(hostId, quizId);
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: 2 });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async createSessionCore(hostId: string, quizId: string) {
    const quiz = await this.quizzesService.findOneByOwner(quizId, hostId);
    if (!quiz)
      throw new ForbiddenException(
        'El cuestionario no existe o no te pertenece',
      );

    for (let attempt = 0; attempt < 10; attempt++) {
      const session = this.sessionManager.reserveSession(hostId, quizId);
      try {
        await this.sessions.save(
          this.sessions.create({
            roomCode: session.pin,
            quizId,
            hostId,
            status: session.status,
            createdAt: session.createdAt,
          }),
        );
      } catch (error: unknown) {
        this.sessionManager.releaseReservation(session.pin);
        if (this.isUniqueViolation(error)) continue;
        throw error;
      }
      this.sessionManager.publishSession(session);
      this.activeSessions.record(this.sessionManager.activeCount);
      this.participants.record(this.listParticipants(session.pin).length);
      return this.summary(session);
    }
    throw new ServiceUnavailableException(
      'No hay código de sala disponible; intenta de nuevo',
    );
  }

  getSessionByCode(roomCode: string) {
    const session = this.sessionManager.requireSession(roomCode);
    return {
      ...this.summary(session),
      ...(session.startedAt && { startedAt: session.startedAt.toISOString() }),
      participants: this.listParticipants(roomCode),
    };
  }

  async listAvailableQuizzes(hostId: string) {
    const quizzes = await this.quizzesService.findAllByOwner(hostId);
    return quizzes.map(({ id, title }) => ({ id, title }));
  }

  joinSession(input: PlayerInput & { roomCode: string }) {
    return this.tracer.startActiveSpan('joinSession', (span) => {
      try {
        const result = this.sessionManager.addPlayer(input.roomCode, input);
        const participants = this.listParticipants(input.roomCode);
        this.events.participantsUpdated(input.roomCode, participants);
        this.participants.record(participants.length);
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: 2 });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  listParticipants(roomCode: string) {
    return this.sessionManager.listPlayers(roomCode);
  }

  removePlayer(roomCode: string, userId: string, socketId?: string) {
    this.sessionManager.removePlayer(roomCode, userId, socketId);
    const participants = this.listParticipants(roomCode);
    this.events.participantsUpdated(roomCode, participants);
    this.participants.record(participants.length);
  }

  async startSession(roomCode: string, hostId: string) {
    return this.tracer.startActiveSpan('startSession', async (span) => {
      try {
        return await this.startSessionCore(roomCode, hostId);
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: 2 });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async startSessionCore(roomCode: string, hostId: string) {
    return this.exclusive(roomCode, async () => {
      this.sessionManager.assertCanStart(roomCode, hostId);
      const startedAt = new Date();
      const result = await this.sessions.update(
        { roomCode, hostId, status: SessionStatus.LOBBY },
        { status: SessionStatus.IN_PROGRESS, startedAt },
      );
      if (result.affected !== 1)
        throw new BadRequestException('La sala no está en LOBBY');
      const session = this.sessionManager.startSession(
        roomCode,
        hostId,
        startedAt,
      );
      this.events.sessionStarted(roomCode, startedAt.toISOString());
      return { ...this.summary(session), startedAt: startedAt.toISOString() };
    });
  }

  /** Persistence hook for Punto 5, not a game-ending endpoint or results flow. */
  async removeSession(roomCode: string): Promise<void> {
    await this.exclusive(roomCode, async () => {
      const session = this.sessionManager.requireSession(roomCode);
      const result = await this.sessions.update(
        { roomCode },
        { status: SessionStatus.FINISHED, finishedAt: new Date() },
      );
      if (result.affected !== 1)
        throw new NotFoundException('Sala inexistente en persistencia');
      session.status = SessionStatus.FINISHED;
      this.sessionManager.removeSession(roomCode);
      this.activeSessions.record(this.sessionManager.activeCount);
    });
  }

  /** Legacy stub intentionally disabled: the old DTO cannot prove identity. */
  joinRoom(_dto: JoinRoomDto): never {
    throw new UnauthorizedException(
      'Usa joinSession con una identidad autenticada',
    );
  }

  submitAnswer(dto: SubmitAnswerDto) {
    const session = this.sessionManager.getSession(dto.pin);
    if (!session) {
      throw new NotFoundException(`Session with PIN ${dto.pin} not found`);
    }
    return { success: true, pin: dto.pin, playerId: dto.playerId };
  }

  private summary(session: ActiveSession) {
    return {
      sessionId: session.pin,
      roomCode: session.pin,
      status: session.status,
      hostId: session.hostId,
      quizId: session.quizId,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }

  /** Serialize start/remove across their DB awaits; rejected operations don't poison the queue. */
  private async exclusive<T>(
    roomCode: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(roomCode) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.locks.set(roomCode, tail);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.locks.get(roomCode) === tail) this.locks.delete(roomCode);
    }
  }
}
