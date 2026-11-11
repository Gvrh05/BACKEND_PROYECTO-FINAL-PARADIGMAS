import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { QuestionOption } from '../src/modules/quizzes/entities/question-option.entity';
import { Quiz } from '../src/modules/quizzes/entities/quiz.entity';
import { questionBody, trueFalseQuestionBody } from './helpers/quiz-fixtures';
import { createTestHarness } from './helpers/test-app';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  beforeEach(async () => {
    harness = await createTestHarness();
    app = await harness.startApp();
  });

  it('keeps the root private and health public with the production prefix', async () => {
    await request(app.getHttpServer()).get('/kahoot-api').expect(401);
    await request(app.getHttpServer()).get('/kahoot-api/health').expect(200);
    await request(app.getHttpServer())
      .get('/kahoot-api')
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200)
      .expect('Hello World!');
  });

  it('keeps data when closing and opening two real application connections', async () => {
    const quiz = await harness.dataSource
      .getRepository(Quiz)
      .save({ authorId: harness.userA, title: 'Persistente' });
    await request(app.getHttpServer())
      .get('/kahoot-api/quizzes')
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(200);
    await harness.closeApp(app);
    app = await harness.startApp();
    const stored = await app
      .get(DataSource)
      .getRepository(Quiz)
      .findOneByOrFail({ id: quiz.id });
    expect(stored.title).toBe('Persistente');
    expect(process.env.UPLOADS_DEST).toBe(harness.uploads);
  });

  it('integrates real authoring ownership and Punto 3 authentication through AppModule', async () => {
    const quiz = await harness.dataSource
      .getRepository(Quiz)
      .save({ authorId: harness.userA, title: 'Punto 3 merge fixture' });
    const api = request(app.getHttpServer());
    await api.get('/kahoot-api/game-sessions/available-quizzes').expect(401);
    const catalog = await api
      .get('/kahoot-api/game-sessions/available-quizzes')
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200);
    expect(catalog.body).toEqual([{ id: quiz.id, title: quiz.title }]);
    await api
      .post('/kahoot-api/game-sessions')
      .auth(harness.tokenB, { type: 'bearer' })
      .send({ quizId: quiz.id })
      .expect(403);
    const created = await api
      .post('/kahoot-api/game-sessions')
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ quizId: quiz.id })
      .expect(201);
    await api
      .post(`/kahoot-api/quizzes/${quiz.id}/questions`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send(trueFalseQuestionBody())
      .expect(201);
    const route = `/kahoot-api/game-sessions/${created.body.roomCode}`;
    await api
      .post(`${route}/join`)
      .auth(harness.tokenB, { type: 'bearer' })
      .send({ name: 'Player' })
      .expect(201);
    await api
      .post(`${route}/start`)
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(403);
    const started = await api
      .post(`${route}/start`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200);
    expect(started.body).toMatchObject({
      hostId: harness.userA,
      quizId: quiz.id,
      status: 'IN_PROGRESS',
      startedAt: expect.any(String),
    });
  });

  it('preserves old four-option questions and enforces the binary format in PostgreSQL', async () => {
    const quiz = await harness.dataSource
      .getRepository(Quiz)
      .save({ authorId: harness.userA, title: 'Tipos de pregunta' });
    const api = request(app.getHttpServer());
    const route = `/kahoot-api/quizzes/${quiz.id}/questions`;
    const legacy = await api
      .post(route)
      .auth(harness.tokenA, { type: 'bearer' })
      .send(questionBody())
      .expect(201);
    await api
      .patch(`${route}/${legacy.body.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ questionText: 'Editada' })
      .expect(200);
    const binary = await api
      .post(route)
      .auth(harness.tokenA, { type: 'bearer' })
      .send(trueFalseQuestionBody())
      .expect(201);
    const edited = await api
      .patch(`${route}/${binary.body.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({
        options: [
          { text: 'Verdadero', isCorrect: false },
          { text: 'Falso', isCorrect: true },
        ],
      })
      .expect(200);
    expect(edited.body.options).toHaveLength(2);
    await expect(
      harness.dataSource.transaction(async (manager) => {
        await manager.update(
          QuestionOption,
          { questionId: binary.body.id, position: 0 },
          { text: 'Falso' },
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });
    const response = await api
      .get(route)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: legacy.body.id,
          options: expect.arrayContaining([
            expect.objectContaining({ text: 'Opción 4' }),
          ]),
        }),
        expect.objectContaining({
          id: binary.body.id,
          kind: 'TRUE_FALSE',
          options: edited.body.options,
        }),
      ]),
    );
  });

  afterEach(async () => {
    if (harness) await harness.dispose();
  });
});
