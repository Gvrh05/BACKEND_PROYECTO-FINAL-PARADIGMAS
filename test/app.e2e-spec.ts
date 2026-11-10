import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Quiz } from '../src/modules/quizzes/entities/quiz.entity';
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

  afterEach(async () => {
    if (harness) await harness.dispose();
  });
});
