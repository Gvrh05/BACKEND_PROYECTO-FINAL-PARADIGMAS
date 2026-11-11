import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { LiveQuestion } from '../engine/live-game';
import { LiveGame, gameError } from '../engine/live-game';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionManager } from '../engine/session-manager';
import type { ActiveSession, PlayerInput } from '../engine/session-manager';
import { JoinRoomDto } from '../dto/join-room.dto';
import {
  GameSessionEntity,
  SessionStatus,
} from '../entities/game-session.entity';
import { QuizzesService } from '../../quizzes/services/quizzes.service';
import { QuestionKind } from '../../quizzes/entities/question.entity';
import { GameSessionEvents } from '../gateways/game-session.events';
import { getMeter, getTracer } from '../../../tracing';

@Injectable()
export class GameSessionService {
  private readonly logger = new Logger(GameSessionService.name);
  private readonly locks = new Map<string, Promise<void>>();
  private readonly tracer = getTracer('game-session');
  private readonly meter = getMeter('game-session');
  private readonly activeSessions = this.meter.createGauge('sessions_active');
  private readonly participants = this.meter.createHistogram(
    'participants_per_session',
  );

  private readonly answers = this.meter.createCounter('game_answers');
  private readonly answerLatency = this.meter.createHistogram(
    'game_answer_latency_ms',
  );
  private readonly reconnects = this.meter.createCounter('game_reconnections');

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
        span.recordException(error instanceof Error ? error : String(error));
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
      session.name = quiz.title;
      try {
        await this.sessions.save(
          this.sessions.create({
            id: session.id,
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

  getSessionByCode(roomCode: string, userId?: string) {
    const session = this.sessionManager.requireSession(roomCode);
    return {
      ...this.summary(session),
      ...(session.startedAt && { startedAt: session.startedAt.toISOString() }),
      participants: this.listParticipants(roomCode),
      ...(userId &&
        session.players.has(userId) &&
        session.liveGame && {
          game: session.liveGame.snapshot(userId),
        }),
    };
  }

  assertHost(roomCode: string, userId: string) {
    if (this.sessionManager.requireSession(roomCode).hostId !== userId)
      throw new NotFoundException('Sala inexistente');
  }

  verifyGuest(token: unknown) {
    return this.sessionManager.verifyGuest(token);
  }

  publicInvitation(invitationId: string, ip: string) {
    this.sessionManager.rateLimit(`ip:${ip}`);
    const session = this.sessionManager.invitation(invitationId);
    return {
      invitationId,
      roomCode: session.pin,
      status: session.status,
      name: session.name,
    };
  }

  createGuest(invitationId: string, username: unknown, ip: string) {
    this.sessionManager.rateLimit(`ip:${ip}`);
    const guest = this.sessionManager.createGuest(invitationId, username);
    this.events.participantsUpdated(
      guest.roomCode,
      this.listParticipants(guest.roomCode),
    );
    return guest;
  }

  async listAvailableQuizzes(hostId: string) {
    const quizzes = await this.quizzesService.findAllByOwner(hostId);
    return quizzes.map(({ id, title }) => ({ id, title }));
  }

  joinSession(input: PlayerInput & { roomCode: string }) {
    return this.tracer.startActiveSpan('joinSession', (span) => {
      try {
        const result = this.sessionManager.addPlayer(input.roomCode, input);
        if (
          !result.added &&
          input.socketId &&
          this.sessionManager.requireSession(input.roomCode).liveGame
        )
          this.reconnects.add(1);
        const participants = this.listParticipants(input.roomCode);
        this.events.participantsUpdated(input.roomCode, participants);
        this.participants.record(participants.length);
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : String(error));
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
        span.recordException(error instanceof Error ? error : String(error));
        span.setStatus({ code: 2 });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async startSessionCore(roomCode: string, hostId: string) {
    return this.exclusive(roomCode, async () => {
      const lobby = this.sessionManager.assertCanStart(roomCode, hostId);
      lobby.acceptingGuests = false;
      let game: LiveGame;
      try {
        game = await this.prepareGame(hostId, lobby.quizId);
      } catch (error) {
        lobby.acceptingGuests = true;
        throw error;
      }
      const startedAt = new Date();
      try {
        const result = await this.sessions.update(
          { roomCode, hostId, status: SessionStatus.LOBBY },
          { status: SessionStatus.IN_PROGRESS, startedAt },
        );
        if (result.affected !== 1)
          throw new BadRequestException('La sala no está en LOBBY');
      } catch (error) {
        lobby.acceptingGuests = true;
        await this.releaseGame(game);
        throw error;
      }
      const session = this.sessionManager.startSession(
        roomCode,
        hostId,
        startedAt,
      );
      session.liveGame = game;
      this.events.sessionStarted(roomCode, startedAt.toISOString());
      this.openRound(session, game);
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
      if (session.liveGame) await this.releaseGame(session.liveGame);
      this.sessionManager.removeSession(roomCode);
      this.activeSessions.record(this.sessionManager.activeCount);
    });
  }

  /** Legacy stub intentionally disabled: the old DTO cannot prove identity. */
  joinRoom(_dto: JoinRoomDto): never {
    void _dto;
    throw new UnauthorizedException(
      'Usa joinSession con una identidad autenticada',
    );
  }

  async submitAnswer(
    roomCode: string,
    userId: string,
    questionId: string,
    answer: boolean,
  ) {
    const started = performance.now();
    try {
      await this.exclusive(roomCode, () => {
        const session = this.sessionManager.requireSession(roomCode);
        if (userId === session.hostId || !session.players.has(userId)) {
          throw gameError(
            'FORBIDDEN',
            'Solo un participante de esta sala puede responder',
          );
        }
        this.requireGame(session).submit(
          userId,
          questionId,
          answer,
          Date.now(),
        );
      });
      this.answers.add(1, { outcome: 'accepted' });
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      const allowed = [
        'LATE_ANSWER',
        'DUPLICATE_ANSWER',
        'WRONG_QUESTION',
        'FORBIDDEN',
        'INVALID_SESSION_STATUS',
      ];
      this.answers.add(1, {
        outcome: allowed.includes(reason) ? reason.toLowerCase() : 'rejected',
      });
      throw error;
    } finally {
      this.answerLatency.record(performance.now() - started);
    }
  }

  async nextQuestion(roomCode: string, hostId: string, questionId: string) {
    return this.exclusive(roomCode, async () => {
      const session = this.sessionManager.requireSession(roomCode);
      if (session.hostId !== hostId)
        throw gameError('FORBIDDEN', 'Solo el anfitrión puede avanzar');
      const game = this.requireGame(session);
      if (!game.closed || game.question.id !== questionId) {
        throw gameError(
          'INVALID_SESSION_STATUS',
          'Espera a que cierre la pregunta actual',
        );
      }
      if (game.index + 1 < game.questions.length) {
        game.index++;
        this.openRound(session, game);
        return;
      }
      const scores = [...session.players.values()]
        .filter((player) => player.userId !== hostId)
        .map((player) => ({
          playerId: player.userId,
          playerName: player.name,
          score: game.scores.get(player.userId) ?? 0,
        }))
        .sort((a, b) => b.score - a.score);
      const result = {
        id: roomCode,
        pin: roomCode,
        quizId: session.quizId,
        totalPlayers: scores.length,
        scores: scores.map((player) => ({
          ...player,
          correctAnswersCount: player.score,
          rank: scores.findIndex(({ score }) => score === player.score) + 1,
        })),
      };
      const updated = await this.sessions.update(
        { roomCode, hostId, status: SessionStatus.IN_PROGRESS },
        { status: SessionStatus.FINISHED, finishedAt: new Date(), result },
      );
      if (updated.affected !== 1)
        throw gameError('INVALID_SESSION_STATUS', 'La partida ya terminó');
      session.status = SessionStatus.FINISHED;
      this.events.toRoom(roomCode, 'game-finished', {
        roomCode,
        version: game.version + 1,
        scores: result.scores.map(({ playerName, score, rank }) => ({
          playerName,
          score,
          rank,
        })),
      });
      this.sessionManager.removeSession(roomCode);
      this.activeSessions.record(this.sessionManager.activeCount);
      await this.releaseGame(game);
    });
  }

  private requireGame(session: ActiveSession): LiveGame {
    if (session.status !== SessionStatus.IN_PROGRESS || !session.liveGame) {
      throw gameError(
        'INVALID_SESSION_STATUS',
        'La sala no tiene una partida activa',
      );
    }
    return session.liveGame;
  }

  private openRound(session: ActiveSession, game: LiveGame) {
    game.open(Date.now());
    this.events.toRoom(session.pin, 'question-opened', {
      roomCode: session.pin,
      game: game.snapshot(),
    });
    const version = game.version;
    game.timer = setTimeout(
      () => {
        void this.exclusive(session.pin, () => {
          if (
            session.status !== SessionStatus.IN_PROGRESS ||
            game.version !== version ||
            !game.close()
          )
            return;
          this.events.toRoom(session.pin, 'question-closed', {
            roomCode: session.pin,
            game: game.snapshot(),
          });
          for (const player of session.players.values()) {
            for (const socketId of player.socketIds) {
              this.events.toSocket(socketId, 'round-result', {
                roomCode: session.pin,
                game: game.snapshot(player.userId),
              });
            }
          }
        }).catch((error: unknown) => {
          this.logger.error(
            'Falló el cierre de una ronda',
            error instanceof Error ? error.stack : undefined,
          );
        });
      },
      Math.max(0, game.closesAt - Date.now()),
    );
    game.timer.unref();
  }

  private async prepareGame(hostId: string, quizId: string): Promise<LiveGame> {
    const { questions } = await this.quizzesService.findOne(hostId, quizId);
    if (
      !questions.length ||
      questions.some(({ kind }) => kind !== QuestionKind.TRUE_FALSE)
    ) {
      throw new BadRequestException(
        'La partida requiere un cuestionario de solo preguntas Verdadero/Falso',
      );
    }
    const uploads = resolve(process.env.UPLOADS_DEST || './uploads');
    let directory: string | undefined;
    try {
      const snapshot: LiveQuestion[] = [];
      for (const question of questions) {
        let imageUrl: string | null = null;
        if (question.imageUrl) {
          const filename = basename(question.imageUrl);
          if (!/^[-\w]+\.(png|jpe?g|webp)$/i.test(filename))
            throw new BadRequestException('Imagen de pregunta inválida');
          if (!directory) {
            const root = join(uploads, 'live');
            await mkdir(root, { recursive: true });
            directory = await mkdtemp(join(root, 'game-'));
          }
          await copyFile(
            join(uploads, 'questions', filename),
            join(directory, filename),
          );
          imageUrl = '/uploads/live/' + basename(directory) + '/' + filename;
        }
        snapshot.push({
          id: question.id,
          questionText: question.questionText,
          imageUrl,
          timeLimitSeconds: question.timeLimitSeconds ?? 20,
          correctAnswer: question.options.some(
            ({ text, isCorrect }) => text === 'Verdadero' && isCorrect,
          ),
        });
      }
      return new LiveGame(snapshot, directory);
    } catch (error) {
      if (directory) await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  private async releaseGame(game: LiveGame) {
    clearTimeout(game.timer);
    if (game.imageDirectory)
      await rm(game.imageDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
  }

  private summary(session: ActiveSession) {
    return {
      sessionId: session.pin,
      invitationId: session.invitationId,
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
    action: () => T | Promise<T>,
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
