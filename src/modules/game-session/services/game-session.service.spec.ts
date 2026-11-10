import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { SessionManager } from '../engine/session-manager';
import {
  GameSessionEntity,
  SessionStatus,
} from '../entities/game-session.entity';
import { QuizzesService } from '../../quizzes/services/quizzes.service';
import { GameSessionService } from './game-session.service';
import { GameSessionEvents } from '../gateways/game-session.events';

describe('GameSessionService', () => {
  let manager: SessionManager;
  let service: GameSessionService;
  let repository: {
    create: jest.Mock<Partial<GameSessionEntity>, [Partial<GameSessionEntity>]>;
    save: jest.Mock<
      Promise<Partial<GameSessionEntity>>,
      [Partial<GameSessionEntity>]
    >;
    update: jest.Mock<Promise<{ affected: number }>, []>;
  };
  let quizzes: {
    findOneByOwner: jest.Mock<
      Promise<{ id: string; ownerId: string } | null>,
      []
    >;
  };

  beforeEach(() => {
    manager = new SessionManager();
    repository = {
      create: jest.fn((data: Partial<GameSessionEntity>) => data),
      save: jest.fn((data: Partial<GameSessionEntity>) =>
        Promise.resolve(data),
      ),
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    quizzes = {
      findOneByOwner: jest.fn(() =>
        Promise.resolve({ id: 'quiz', ownerId: 'host' }),
      ),
    };
    service = new GameSessionService(
      manager,
      quizzes as unknown as QuizzesService,
      repository as unknown as Repository<GameSessionEntity>,
      new GameSessionEvents(),
    );
  });

  it('createSession rejects a quiz owned by another host or absent with ForbiddenException', async () => {
    quizzes.findOneByOwner.mockResolvedValue(null);
    await expect(
      service.createSession('other-host', 'quiz'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(quizzes.findOneByOwner).toHaveBeenCalledWith('quiz', 'other-host');
    expect(repository.save).not.toHaveBeenCalled();
    expect(manager.activeCount).toBe(0);
  });

  it('creates and persists the room, including the host exactly once', async () => {
    const created = await service.createSession('host', 'quiz');
    expect(created).toEqual({
      sessionId: expect.stringMatching(/^\d{6}$/) as unknown,
      roomCode: created.sessionId,
      status: SessionStatus.LOBBY,
      hostId: 'host',
      quizId: 'quiz',
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        roomCode: created.roomCode,
        hostId: 'host',
        quizId: 'quiz',
        status: SessionStatus.LOBBY,
        createdAt: expect.any(Date) as unknown,
      }),
    );
    expect(service.listParticipants(created.roomCode)).toEqual([
      { userId: 'host', name: 'Anfitrión', connected: false },
    ]);
  });

  it('keeps a pending save private and releases its reservation on failure', async () => {
    let rejectSave!: (reason: Error) => void;
    repository.save.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject;
        }),
    );
    const pending = service.createSession('host', 'quiz');
    // Let ownership lookup complete, without advancing the persistence promise.
    await Promise.resolve();
    const pin = repository.create.mock.calls[0][0].roomCode as string;
    expect(manager.getSession(pin)).toBeUndefined();
    expect(manager.activeCount).toBe(0);
    rejectSave(new Error('test database unavailable'));
    await expect(pending).rejects.toThrow('test database unavailable');
    expect(manager.activeCount).toBe(0);
    await expect(service.createSession('host', 'quiz')).resolves.toBeDefined();
  });

  it('retries a unique violation without overwriting a historical room', async () => {
    repository.save.mockRejectedValueOnce(
      Object.assign(new Error('collision'), { code: '23505' }),
    );
    const created = await service.createSession('host', 'quiz');
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(manager.activeCount).toBe(1);
    expect(manager.requireSession(created.roomCode).hostId).toBe('host');
  });

  it('bounds unique-PIN retries and leaves no active room on exhaustion', async () => {
    repository.save.mockRejectedValue({ code: '23505' });
    await expect(service.createSession('host', 'quiz')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.save).toHaveBeenCalledTimes(10);
    expect(manager.activeCount).toBe(0);
  });

  it('joinSession is idempotent for the same userId and host plus player returns two users', async () => {
    const { roomCode } = await service.createSession('host', 'quiz');
    expect(
      service.joinSession({ roomCode, userId: 'p', name: 'Player' }).added,
    ).toBe(true);
    expect(
      service.joinSession({ roomCode, userId: 'p', socketId: 'socket' }).added,
    ).toBe(false);
    expect(service.listParticipants(roomCode)).toHaveLength(2);
    expect(service.getSessionByCode(roomCode).participants).toEqual(
      service.listParticipants(roomCode),
    );
  });

  it('startSession rejects a non-host before any persistence change', async () => {
    const { roomCode } = await service.createSession('host', 'quiz');
    await expect(
      service.startSession(roomCode, 'player'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.update).not.toHaveBeenCalled();
    expect(service.getSessionByCode(roomCode).status).toBe(SessionStatus.LOBBY);
  });

  it('persists status and startedAt, rejecting a second start or a FINISHED room', async () => {
    const { roomCode } = await service.createSession('host', 'quiz');
    const result = await service.startSession(roomCode, 'host');
    expect(result.status).toBe(SessionStatus.IN_PROGRESS);
    expect(repository.update).toHaveBeenCalledWith(
      { roomCode, hostId: 'host', status: SessionStatus.LOBBY },
      {
        status: SessionStatus.IN_PROGRESS,
        startedAt: new Date(result.startedAt),
      },
    );
    await expect(service.startSession(roomCode, 'host')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    manager.requireSession(roomCode).status = SessionStatus.FINISHED;
    await expect(service.startSession(roomCode, 'host')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('does not publish IN_PROGRESS if the persisted update fails, and can retry afterwards', async () => {
    const { roomCode } = await service.createSession('host', 'quiz');
    repository.update.mockRejectedValueOnce(new Error('write failure'));
    await expect(service.startSession(roomCode, 'host')).rejects.toThrow(
      'write failure',
    );
    expect(service.getSessionByCode(roomCode)).toMatchObject({
      status: SessionStatus.LOBBY,
    });
    expect(manager.requireSession(roomCode).startedAt).toBeUndefined();
    await expect(service.startSession(roomCode, 'host')).resolves.toMatchObject(
      { status: SessionStatus.IN_PROGRESS },
    );
  });

  it('rejects a conditional-update conflict without changing memory', async () => {
    const { roomCode } = await service.createSession('host', 'quiz');
    repository.update.mockResolvedValueOnce({ affected: 0 });
    await expect(service.startSession(roomCode, 'host')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.getSessionByCode(roomCode).status).toBe(SessionStatus.LOBBY);
  });

  it('serializes concurrent start requests so exactly one performs the transition', async () => {
    const { roomCode } = await service.createSession('host', 'quiz');
    const results = await Promise.allSettled([
      service.startSession(roomCode, 'host'),
      service.startSession(roomCode, 'host'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BadRequestException);
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('allows existing participants to reconnect after start but rejects new players', async () => {
    const { roomCode } = await service.createSession('host', 'quiz');
    service.joinSession({ roomCode, userId: 'p', socketId: 'old' });
    await service.startSession(roomCode, 'host');
    service.removePlayer(roomCode, 'p', 'old');
    expect(
      service.listParticipants(roomCode).find((p) => p.userId === 'p')
        ?.connected,
    ).toBe(false);
    expect(
      service.joinSession({ roomCode, userId: 'p', socketId: 'new' }).added,
    ).toBe(false);
    expect(() => service.joinSession({ roomCode, userId: 'unknown' })).toThrow(
      BadRequestException,
    );
  });

  it('persists FINISHED/finishedAt before removing a room, without implementing results', async () => {
    const { roomCode } = await service.createSession('host', 'quiz');
    await service.removeSession(roomCode);
    expect(repository.update).toHaveBeenCalledWith(
      { roomCode },
      {
        status: SessionStatus.FINISHED,
        finishedAt: expect.any(Date) as unknown,
      },
    );
    expect(manager.getSession(roomCode)).toBeUndefined();
    expect(manager.activeCount).toBe(0);
    expect(() => service.getSessionByCode(roomCode)).toThrow(NotFoundException);
  });

  it('keeps the room if persisting its removal fails', async () => {
    const { roomCode } = await service.createSession('host', 'quiz');
    repository.update.mockRejectedValueOnce(new Error('write failure'));
    await expect(service.removeSession(roomCode)).rejects.toThrow(
      'write failure',
    );
    expect(service.getSessionByCode(roomCode).status).toBe(SessionStatus.LOBBY);
  });
});
