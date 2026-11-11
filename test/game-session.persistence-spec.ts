import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Quiz } from '../src/modules/quizzes/entities/quiz.entity';
import {
  Question,
  QuestionKind,
} from '../src/modules/quizzes/entities/question.entity';
import { QuestionOption } from '../src/modules/quizzes/entities/question-option.entity';
import { QuizzesService } from '../src/modules/quizzes/services/quizzes.service';
import {
  GameSessionEntity,
  SessionStatus,
} from '../src/modules/game-session/entities/game-session.entity';
import { SessionManager } from '../src/modules/game-session/engine/session-manager';
import { GameSessionEvents } from '../src/modules/game-session/gateways/game-session.events';
import { GameSessionService } from '../src/modules/game-session/services/game-session.service';
import { trueFalseQuestionBody } from './helpers/quiz-fixtures';
import { getDatabaseOptions } from '../src/shared/database/database.config';

/** Opt-in real Postgres integration, never part of the default transport e2e.
 * Only a random, test-owned schema in the dedicated local test DB is removed.
 * This inserts its own fixtures, NOT the manual demo seed.
 */
describe('GameSession persistence with real Postgres', () => {
  jest.setTimeout(60000);
  const schema = `punto3_${randomUUID().replace(/-/g, '')}`;
  const hostId = randomUUID();
  let database: DataSource;
  let schemaCreated = false;
  let quizzes: QuizzesService;
  let manager: SessionManager;
  let service: GameSessionService;
  let quiz: Quiz;

  beforeAll(async () => {
    const raw = process.env.TEST_DATABASE_URL;
    if (!raw)
      throw new Error(
        'Use pnpm test:persistence or configure TEST_DATABASE_URL',
      );
    const url = new URL(raw);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/kahoot_punto3_test'
    ) {
      throw new Error(
        'Persistence tests require the dedicated local database kahoot_punto3_test',
      );
    }
    database = new DataSource({
      ...getDatabaseOptions({ DATABASE_URL: raw }),
      schema,
    });
    await database.initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.createSchema(schema, false);
      schemaCreated = true;
    } finally {
      await runner.release();
    }
    await database.runMigrations();
    quizzes = new QuizzesService(database);
    manager = new SessionManager();
    service = new GameSessionService(
      manager,
      quizzes,
      database.getRepository(GameSessionEntity),
      new GameSessionEvents(),
    );
    quiz = await database
      .getRepository(Quiz)
      .save({ title: 'Integration fixture (not demo seed)', authorId: hostId });
    await database.transaction(async (manager) => {
      const { questionText, options } = trueFalseQuestionBody();
      const question = await manager.save(Question, {
        quizId: quiz.id,
        questionText,
        kind: QuestionKind.TRUE_FALSE,
      });
      await manager.save(
        QuestionOption,
        options.map((option, position) => ({
          ...option,
          questionId: question.id,
          position,
        })),
      );
    });
  });

  afterAll(async () => {
    if (!database?.isInitialized) return;
    try {
      if (schemaCreated) {
        const runner = database.createQueryRunner();
        try {
          await runner.dropSchema(schema, true, true);
        } finally {
          await runner.release();
        }
      }
    } finally {
      await database.destroy();
    }
  });

  it('maps the authoring schema and owner queries using real repositories', async () => {
    const columns: { column_name: string }[] = await database.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ($2, $3)',
      [schema, 'quizzes', 'questions'],
    );
    expect(columns.map((column) => column.column_name)).toEqual(
      expect.arrayContaining(['author_id', 'quiz_id', 'question_text']),
    );
    await expect(quizzes.findAllByOwner(hostId)).resolves.toEqual([
      expect.objectContaining({ id: quiz.id }),
    ]);
    await expect(
      service.createSession('other-owner', quiz.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(quizzes.findAll(hostId)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: quiz.id })]),
    );
  });

  it('persists a UUID row and a unique six-digit code before publishing LOBBY', async () => {
    const created = await service.createSession(hostId, quiz.id);
    const row = await database
      .getRepository(GameSessionEntity)
      .findOneByOrFail({ roomCode: created.roomCode });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.roomCode).toMatch(/^\d{6}$/);
    expect(row).toMatchObject({
      quizId: quiz.id,
      hostId,
      status: SessionStatus.LOBBY,
      createdAt: expect.any(Date) as unknown,
      startedAt: null,
      finishedAt: null,
    });
    expect(manager.requireSession(row.roomCode).hostId).toBe(hostId);
    await expect(
      database
        .getRepository(GameSessionEntity)
        .insert({ roomCode: row.roomCode, quizId: quiz.id, hostId }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('persists IN_PROGRESS and the same startedAt returned by the service', async () => {
    const created = await service.createSession(hostId, quiz.id);
    const started = await service.startSession(created.roomCode, hostId);
    const row = await database
      .getRepository(GameSessionEntity)
      .findOneByOrFail({ roomCode: created.roomCode });
    expect(row.status).toBe(SessionStatus.IN_PROGRESS);
    expect(row.startedAt?.toISOString()).toBe(started.startedAt);
  });

  it('persists FINISHED/finishedAt before removing memory through the lifecycle hook', async () => {
    const created = await service.createSession(hostId, quiz.id);
    await service.startSession(created.roomCode, hostId);
    await service.removeSession(created.roomCode);
    const row = await database
      .getRepository(GameSessionEntity)
      .findOneByOrFail({ roomCode: created.roomCode });
    expect(row.status).toBe(SessionStatus.FINISHED);
    expect(row.finishedAt).toBeInstanceOf(Date);
    expect(row.finishedAt!.getTime()).toBeGreaterThanOrEqual(
      row.startedAt!.getTime(),
    );
    expect(manager.getSession(created.roomCode)).toBeUndefined();
  });

  it('enforces the physical question FK with cascade inside the isolated test schema', async () => {
    const temporary = await database
      .getRepository(Quiz)
      .save({ title: 'Cascade fixture', authorId: hostId });
    await database.transaction(async (manager) => {
      const question = await manager.getRepository(Question).save({
        quizId: temporary.id,
        questionText: 'Fixture?',
      });
      await manager.getRepository(QuestionOption).save(
        Array.from({ length: 4 }, (_, position) => ({
          questionId: question.id,
          text: `Option ${position}`,
          isCorrect: position === 0,
          position,
        })),
      );
    });
    await database.getRepository(Quiz).delete(temporary.id);
    expect(
      await database.getRepository(Question).countBy({ quizId: temporary.id }),
    ).toBe(0);
  });
});
