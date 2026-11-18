import { DEFAULT_DRAGONBALL_QUIZ_ID } from '../src/modules/quizzes/services/dragonball-catalog';
import { DEFAULT_POKEMON_QUIZ_ID } from '../src/modules/quizzes/services/pokemon-catalog';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Quiz } from '../src/modules/quizzes/entities/quiz.entity';
import { Question } from '../src/modules/quizzes/entities/question.entity';
import { QuestionOption } from '../src/modules/quizzes/entities/question-option.entity';
import { FileCleanupJob } from '../src/modules/quizzes/entities/file-cleanup-job.entity';
import { createTestHarness } from './helpers/test-app';

describe('Private quiz authoring', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let app: INestApplication;
  const root = '/kahoot-api/quizzes';
  beforeAll(async () => {
    harness = await createTestHarness();
    app = await harness.startApp();
  });
  afterAll(async () => {
    if (harness) await harness.dispose();
  });

  const http = () => request(app.getHttpServer());
  const createQuiz = async (title = 'Ciencias', token = harness.tokenA) =>
    (
      await http()
        .post(root)
        .auth(token, { type: 'bearer' })
        .send({ title })
        .expect(201)
    ).body;

  it('provisions one illustrated Pokémon starter across concurrent first visits', async () => {
    const responses = await Promise.all(
      [harness.tokenA, harness.tokenB, harness.tokenA].map((token) =>
        http().get(root).auth(token, { type: 'bearer' }).expect(200),
      ),
    );
    for (const response of responses) {
      expect(response.body).toHaveLength(2);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: DEFAULT_POKEMON_QUIZ_ID,
            title: 'Pokémon · Desafío de la Pokédex',
            isDemo: true,
          }),
          expect.objectContaining({
            id: DEFAULT_DRAGONBALL_QUIZ_ID,
            title: 'Dragon Ball · Desafío de los Guerreros Z',
            isDemo: true,
          }),
        ]),
      );
    }
    expect(
      await harness.dataSource
        .getRepository(Quiz)
        .countBy({ id: DEFAULT_POKEMON_QUIZ_ID }),
    ).toBe(1);
    const { body } = await http()
      .get(root + '/' + DEFAULT_POKEMON_QUIZ_ID)
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(200);
    expect(body.questions).toHaveLength(20);
    expect(
      body.questions.every((q: { imageUrl: string }) =>
        q.imageUrl?.endsWith('.png'),
      ),
    ).toBe(true);
    await http()
      .get(body.questions[0].imageUrl)
      .expect(200)
      .expect('Content-Type', /image/);
    await http()
      .post('/kahoot-api/game-sessions')
      .auth(harness.tokenB, { type: 'bearer' })
      .send({ quizId: DEFAULT_POKEMON_QUIZ_ID })
      .expect(201);
  });

  it('offers the illustrated Dragon Ball starter to both accounts and permits hosting it', async () => {
    for (const token of [harness.tokenA, harness.tokenB]) {
      const { body } = await http()
        .get(root + '/' + DEFAULT_DRAGONBALL_QUIZ_ID)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(body.questions).toHaveLength(20);
      expect(
        body.questions.some(
          (q: { options: unknown[] }) => q.options.length === 5,
        ),
      ).toBe(true);
      expect(
        body.questions.some((q: { kind?: string }) => q.kind === 'TRUE_FALSE'),
      ).toBe(true);
      await http()
        .get(body.questions[0].imageUrl)
        .expect(200)
        .expect('Content-Type', /image/);
      await http()
        .post('/kahoot-api/game-sessions')
        .auth(token, { type: 'bearer' })
        .send({ quizId: DEFAULT_DRAGONBALL_QUIZ_ID })
        .expect(201);
    }
  });

  it('refreshes old starter wording without creating another quiz', async () => {
    const question = await harness.dataSource
      .getRepository(Question)
      .findOneByOrFail({ quizId: DEFAULT_DRAGONBALL_QUIZ_ID });
    await harness.dataSource
      .getRepository(Question)
      .update(question.id, { questionText: 'Según la API, pregunta antigua' });
    await http().get(root).auth(harness.tokenA, { type: 'bearer' }).expect(200);
    for (const id of [DEFAULT_POKEMON_QUIZ_ID, DEFAULT_DRAGONBALL_QUIZ_ID]) {
      const { body } = await http()
        .get(root + '/' + id)
        .auth(harness.tokenA, { type: 'bearer' })
        .expect(200);
      expect(body.questions).toHaveLength(20);
      expect(
        JSON.stringify({
          title: body.title,
          description: body.description,
          questions: body.questions,
        }),
      ).not.toMatch(/\bapi\b|según.*ficha/i);
      expect(await harness.dataSource.getRepository(Quiz).countBy({ id })).toBe(
        1,
      );
    }
  });

  it('creates direct persisted resources and isolates the two owner lists', async () => {
    const quiz = await createQuiz();
    await createQuiz('Privado de B', harness.tokenB);
    expect(quiz).toMatchObject({
      title: 'Ciencias',
      authorId: harness.userA,
      description: null,
      coverImageUrl: null,
    });
    expect(quiz.id).toMatch(/^[\da-f-]{36}$/);
    expect(quiz.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(quiz).not.toHaveProperty('data');
    const response = await http()
      .get(root)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200);
    expect(
      response.body.every(
        (item: { authorId: string; id: string }) =>
          item.authorId === harness.userA ||
          [DEFAULT_POKEMON_QUIZ_ID, DEFAULT_DRAGONBALL_QUIZ_ID].includes(
            item.id,
          ),
      ),
    ).toBe(true);
    const detail = await http()
      .get(`${root}/${quiz.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200);
    expect(detail.body.questions).toEqual([]);
  });

  it('returns the same not-found error for foreign and unknown quiz UUIDs', async () => {
    const quiz = await createQuiz();
    const foreign = await http()
      .get(`${root}/${quiz.id}`)
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(404);
    const missing = await http()
      .get(`${root}/${randomUUID()}`)
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(404);
    expect(foreign.body.error).toEqual(missing.body.error);
  });

  it('shows the read-only demo quiz to every account and rejects mutations', async () => {
    const demo = await harness.dataSource.getRepository(Quiz).save({
      authorId: harness.userA,
      title: 'Demo compartido',
      isDemo: true,
    });
    const response = await http()
      .get(root)
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: DEFAULT_POKEMON_QUIZ_ID }),
      ]),
    );
    expect(response.body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: demo.id })]),
    );
    await http()
      .get(`${root}/${demo.id}`)
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(200);
    await http()
      .patch(`${root}/${demo.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ title: 'Mutado' })
      .expect(403);
    await http()
      .delete(`${root}/${demo.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(403);
    await http()
      .post(`${root}/${demo.id}/questions`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({
        questionText: 'Nueva',
        options: ['A', 'B', 'C', 'D'].map((text, position) => ({
          text,
          isCorrect: position === 0,
        })),
      })
      .expect(403);
  });

  it('includes persisted questions and their ordered options in the detail', async () => {
    const quiz = await createQuiz();
    await harness.dataSource.transaction(async (manager) => {
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
    });
    const detail = await http()
      .get(`${root}/${quiz.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200);
    expect(detail.body.questions[0]).toMatchObject({
      questionText: '¿Cuál?',
      timeLimitSeconds: 20,
      points: 1000,
      imageUrl: null,
    });
    expect(
      detail.body.questions[0].options.map(
        (option: { text: string }) => option.text,
      ),
    ).toEqual(['0', '1', '2', '3']);
  });

  it('can read a created quiz after restarting the application', async () => {
    const quiz = await createQuiz('Después del reinicio');
    await harness.closeApp(app);
    app = await harness.startApp();
    await http()
      .get(`${root}/${quiz.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body.title).toBe('Después del reinicio'));
    expect(
      await harness.dataSource.getRepository(Quiz).countBy({ id: quiz.id }),
    ).toBe(1);
  });

  it('patches only provided metadata and supports clearing nullable fields', async () => {
    const { body: quiz } = await http()
      .post(root)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({
        title: 'Original',
        description: 'Descripción',
        coverImageUrl: 'https://example.com/cover.png',
      })
      .expect(201);
    const { body: changed } = await http()
      .patch(`${root}/${quiz.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ title: 'Nuevo' })
      .expect(200);
    expect(changed).toMatchObject({
      authorId: harness.userA,
      title: 'Nuevo',
      description: 'Descripción',
      coverImageUrl: quiz.coverImageUrl,
      createdAt: quiz.createdAt,
    });
    expect(changed.updatedAt).not.toBe(quiz.updatedAt);
    const { body: cleared } = await http()
      .patch(`${root}/${quiz.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ description: null, coverImageUrl: null })
      .expect(200);
    expect(cleared).toMatchObject({
      title: 'Nuevo',
      description: null,
      coverImageUrl: null,
    });
    for (const body of [{}, { title: null }, { authorId: harness.userB }]) {
      await http()
        .patch(`${root}/${quiz.id}`)
        .auth(harness.tokenA, { type: 'bearer' })
        .send(body)
        .expect(400);
    }
  });

  it('rejects editing or deleting foreign quizzes without revealing existence', async () => {
    const quiz = await createQuiz();
    for (const id of [quiz.id, randomUUID()]) {
      await http()
        .patch(`${root}/${id}`)
        .auth(harness.tokenB, { type: 'bearer' })
        .send({ title: 'No' })
        .expect(404);
      await http()
        .delete(`${root}/${id}`)
        .auth(harness.tokenB, { type: 'bearer' })
        .expect(404);
    }
    expect(
      (
        await harness.dataSource
          .getRepository(Quiz)
          .findOneByOrFail({ id: quiz.id })
      ).title,
    ).toBe(quiz.title);
  });

  it('deletes a quiz, cascades questions/options and durably queues its image', async () => {
    const quiz = await createQuiz();
    const question = await harness.dataSource.transaction(async (manager) => {
      const question = await manager.save(Question, {
        quizId: quiz.id,
        questionText: 'Imagen',
        imageStorageKey: 'test-cascade.png',
        imageUrl: '/uploads/questions/test-cascade.png',
        imageMimeType: 'image/png',
        imageSize: 12,
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
    const removed = await http()
      .delete(`${root}/${quiz.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(204);
    expect(removed.text).toBe('');
    await http()
      .get(`${root}/${quiz.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(404);
    expect(
      await harness.dataSource
        .getRepository(Question)
        .countBy({ id: question.id }),
    ).toBe(0);
    expect(
      await harness.dataSource
        .getRepository(QuestionOption)
        .countBy({ questionId: question.id }),
    ).toBe(0);
    expect(
      await harness.dataSource
        .getRepository(FileCleanupJob)
        .countBy({ storageKey: 'test-cascade.png' }),
    ).toBe(1);
  });
});
