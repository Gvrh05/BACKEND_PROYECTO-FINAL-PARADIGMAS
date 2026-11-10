import { randomUUID } from 'node:crypto';
import { Quiz } from '../src/modules/quizzes/entities/quiz.entity';
import { Question } from '../src/modules/quizzes/entities/question.entity';
import { QuestionOption } from '../src/modules/quizzes/entities/question-option.entity';
import { FileCleanupJob } from '../src/modules/quizzes/entities/file-cleanup-job.entity';
import { createTestDatabase } from './helpers/test-database';

describe('Quiz migrations (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeEach(async () => {
    database = await createTestDatabase();
  });
  afterEach(async () => {
    if (database) await database.dispose();
  });

  it('creates four tables and supports down/up in an isolated schema', async () => {
    const ds = database.dataSource;
    for (const entity of [Quiz, Question, QuestionOption, FileCleanupJob]) {
      expect(await ds.getRepository(entity).count()).toBe(0);
    }
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    expect(await ds.showMigrations()).toBe(true);
    await ds.runMigrations();
    expect(await ds.showMigrations()).toBe(false);
    expect(await ds.getRepository(Quiz).count()).toBe(0);
  });

  it('persists UUIDs and cascades quiz -> question -> options', async () => {
    const ds = database.dataSource;
    const quiz = await ds
      .getRepository(Quiz)
      .save({ authorId: randomUUID(), title: 'Ciencias' });
    const question = await ds.transaction(async (manager) => {
      const question = await manager.save(Question, {
        quizId: quiz.id,
        questionText: '¿Cuál?',
      });
      await manager.save(
        QuestionOption,
        Array.from({ length: 4 }, (_, position) => ({
          questionId: question.id,
          text: `${position}`,
          position,
          isCorrect: position === 0,
        })),
      );
      return question;
    });
    expect(quiz.id).toMatch(/^[\da-f-]{36}$/);
    expect(question.timeLimitSeconds).toBe(20);
    expect(question.points).toBe(1000);
    await ds.getRepository(Quiz).delete(quiz.id);
    expect(await ds.getRepository(Question).count()).toBe(0);
    expect(await ds.getRepository(QuestionOption).count()).toBe(0);
  });

  async function createQuestion(correctCount = 1, optionCount = 4) {
    return database.dataSource.transaction(async (manager) => {
      const quiz = await manager.save(Quiz, {
        authorId: randomUUID(),
        title: 'Quiz',
      });
      const question = await manager.save(Question, {
        quizId: quiz.id,
        questionText: 'Texto',
      });
      await manager.save(
        QuestionOption,
        Array.from({ length: optionCount }, (_, position) => ({
          questionId: question.id,
          position,
          text: `Opción ${position}`,
          isCorrect: position < correctCount,
        })),
      );
      return question;
    });
  }

  it.each([
    [0, 4],
    [2, 4],
    [1, 3],
    [0, 0],
  ])(
    'rejects %i correct among %i options at commit',
    async (correct, count) => {
      await expect(createQuestion(correct, count)).rejects.toMatchObject({
        driverError: { code: '23514' },
      });
      expect(await database.dataSource.getRepository(Question).count()).toBe(0);
    },
  );

  it('checks numeric ranges, option positions and image metadata', async () => {
    const ds = database.dataSource;
    const question = await createQuestion();
    for (const update of [
      { timeLimitSeconds: 0 },
      { timeLimitSeconds: 301 },
      { points: -1 },
      { imageStorageKey: 'file-without-metadata' },
    ]) {
      await expect(
        ds.getRepository(Question).update(question.id, update),
      ).rejects.toMatchObject({ driverError: { code: '23514' } });
    }
    await expect(
      ds
        .getRepository(QuestionOption)
        .update({ questionId: question.id, position: 0 }, { position: 4 }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    expect(
      (await ds.getRepository(Question).findOneByOrFail({ id: question.id }))
        .imageStorageKey,
    ).toBeNull();
  });

  it('checks the old and new parent on reassignment and permits a deleted parent', async () => {
    const ds = database.dataSource;
    const first = await createQuestion();
    const second = await createQuestion();
    const move = async (deleteOld: boolean) =>
      ds.transaction(async (manager) => {
        await manager.delete(QuestionOption, { questionId: second.id });
        await manager.update(
          QuestionOption,
          { questionId: first.id },
          { questionId: second.id },
        );
        if (deleteOld) await manager.delete(Question, first.id);
      });
    await expect(move(false)).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    expect(
      await ds.getRepository(QuestionOption).countBy({ questionId: first.id }),
    ).toBe(4);
    await expect(move(true)).resolves.toBeUndefined();
    expect(
      await ds.getRepository(Question).findOneBy({ id: first.id }),
    ).toBeNull();
    expect(
      await ds.getRepository(QuestionOption).countBy({ questionId: second.id }),
    ).toBe(4);
  });
});
