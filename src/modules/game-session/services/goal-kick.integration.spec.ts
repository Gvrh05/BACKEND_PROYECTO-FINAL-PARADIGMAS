import { randomUUID } from 'node:crypto';
import { GameSessionService } from './game-session.service';
import { SessionManager } from '../engine/session-manager';
import { GameSessionEvents } from '../gateways/game-session.events';
import { QuizzesService } from '../../quizzes/services/quizzes.service';
import { Repository } from 'typeorm';
import { GameSessionEntity } from '../entities/game-session.entity';
import { parseGoalKickCommand } from '../dto/goal-kick-command.dto';
describe('Goal kick session lifecycle without database mutation', () => {
  let manager: SessionManager, service: GameSessionService;
  const events = {
    toSocket: jest.fn(),
    toRoom: jest.fn(),
    participantsUpdated: jest.fn(),
    sessionStarted: jest.fn(),
  };
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    manager = new SessionManager();
    service = new GameSessionService(
      manager,
      {} as QuizzesService,
      {} as Repository<GameSessionEntity>,
      events as unknown as GameSessionEvents,
    );
  });
  afterEach(() => {
    manager.onModuleDestroy();
    jest.useRealTimers();
  });
  it('freezes admission, preserves overlapping/reconnecting identities and returns safely to trivia lobby', async () => {
    const room = manager.createSession('host', 'quiz');
    service.joinSession({ roomCode: room.pin, userId: 'host', socketId: 'h' });
    service.joinSession({
      roomCode: room.pin,
      userId: 'p',
      socketId: 'p1',
      avatarId: 14,
    });
    const commandId = randomUUID();
    await service.goalKickCommand('host', 'start', {
      roomCode: room.pin,
      commandId,
    });
    const gameId = room.goalKick!.gameId;
    await service.goalKickCommand('host', 'start', {
      roomCode: room.pin,
      commandId,
    });
    expect(room.goalKick!.gameId).toBe(gameId);
    expect(() => manager.assertCanStart(room.pin, 'host')).toThrow();
    expect(() => manager.createGuest(room.invitationId, 'New')).toThrow();
    expect(() => manager.addPlayer(room.pin, { userId: 'new' })).toThrow();
    service.removePlayer(room.pin, 'p', 'p1');
    expect(room.players.has('p')).toBe(true);
    service.joinSession({ roomCode: room.pin, userId: 'p', socketId: 'p2' });
    const snapshot = service.getSessionByCode(room.pin, 'p').goalKick;
    expect(snapshot?.gameId).toBe(gameId);
    expect(snapshot?.view).toBe('player');
    await expect(
      service.goalKickCommand('p', 'cancel', {
        roomCode: room.pin,
        gameId,
        commandId: randomUUID(),
      }),
    ).rejects.toThrow();
    await service.goalKickCommand('host', 'cancel', {
      roomCode: room.pin,
      gameId,
      commandId: randomUUID(),
    });
    const back = { roomCode: room.pin, gameId, commandId: randomUUID() };
    await service.goalKickCommand('host', 'return', back);
    await service.goalKickCommand('host', 'return', back);
    expect(room.goalKick).toBeUndefined();
    expect(room.acceptingGuests).toBe(true);
    expect(manager.assertCanStart(room.pin, 'host')).toBe(room);
  });
  it('ends by the server timer and clears timers on removal', async () => {
    const room = manager.createSession('host', 'quiz');
    service.joinSession({ roomCode: room.pin, userId: 'host', socketId: 'h' });
    service.joinSession({ roomCode: room.pin, userId: 'p', socketId: 'p' });
    await service.goalKickCommand('host', 'start', {
      roomCode: room.pin,
      commandId: randomUUID(),
    });
    await jest.advanceTimersByTimeAsync(40000);
    expect(room.goalKick?.phase).toBe('FINISHED');
    expect(events.toRoom).toHaveBeenCalledWith(
      room.pin,
      'game:ended',
      expect.objectContaining({ reason: 'TIME_UP' }),
    );
    manager.removeSession(room.pin);
    await jest.advanceTimersByTimeAsync(50000);
  });
  it('strictly rejects spoofed fields, invalid coordinates and malformed IDs', () => {
    const valid = {
      roomCode: '123456',
      gameId: randomUUID(),
      attemptId: randomUUID(),
      commandId: randomUUID(),
      aimX: 272,
      curve: 65,
    };
    expect(parseGoalKickCommand('shoot', valid)).toEqual(valid);
    for (const extra of [
      { score: 10 },
      { userId: 'other' },
      { aimX: Infinity },
      { curve: 261 },
      { aimX: '272' },
      { gameId: 'bad' },
    ])
      expect(() =>
        parseGoalKickCommand('shoot', { ...valid, ...extra }),
      ).toThrow();
  });

  it.each([
    ['classic', 20],
    ['speed', 14],
    ['precision', 25],
  ] as const)(
    'keeps five-choice trivia and %s scoring after returning from football',
    async (mode, expectedPoints) => {
      const quizId = randomUUID(),
        questionId = randomUUID();
      const quizzes = {
        findOneByOwner: jest.fn(() =>
          Promise.resolve({ title: 'Trivia mixta' }),
        ),
        findOne: jest.fn(() =>
          Promise.resolve({
            questions: [
              {
                id: questionId,
                kind: 'MULTIPLE_CHOICE',
                questionText: 'Elige la quinta',
                timeLimitSeconds: 20,
                imageUrl: null,
                options: Array.from({ length: 5 }, (_, index) => ({
                  text: `Opción ${index + 1}`,
                  isCorrect: index === 4,
                })),
              },
            ],
          }),
        ),
      };
      const repository = {
        create: jest.fn((value: unknown) => value),
        save: jest.fn((value: unknown) => Promise.resolve(value)),
        update: jest.fn(() => Promise.resolve({ affected: 1 })),
      };
      service = new GameSessionService(
        manager,
        quizzes as unknown as QuizzesService,
        repository as unknown as Repository<GameSessionEntity>,
        events as unknown as GameSessionEvents,
      );
      const summary = await service.createSession('host', quizId, mode);
      const room = manager.requireSession(summary.roomCode);
      service.joinSession({
        roomCode: room.pin,
        userId: 'host',
        socketId: 'h',
      });
      service.joinSession({
        roomCode: room.pin,
        userId: 'p',
        socketId: 'p',
        avatarId: 14,
      });
      await service.goalKickCommand('host', 'start', {
        roomCode: room.pin,
        commandId: randomUUID(),
      });
      const football = room.goalKick!;
      await service.goalKickCommand('host', 'cancel', {
        roomCode: room.pin,
        gameId: football.gameId,
        commandId: randomUUID(),
      });
      await service.goalKickCommand('host', 'return', {
        roomCode: room.pin,
        gameId: football.gameId,
        commandId: randomUUID(),
      });
      await service.startSession(room.pin, 'host');
      expect(room.liveGame?.scoringMode).toBe(mode);
      expect(room.liveGame?.snapshot('p').choices).toHaveLength(5);
      await jest.advanceTimersByTimeAsync(11000);
      await service.submitAnswer(room.pin, 'p', questionId, 4);
      await service.closeVoting(room.pin, 'host', questionId);
      expect(room.liveGame?.scores.get('p')).toBe(expectedPoints);
      expect(football.scoreboard()[0].score).toBe(0);
      expect(room.players.get('p')?.avatarId).toBe(14);
      await service.removeSession(room.pin);
    },
  );
});
