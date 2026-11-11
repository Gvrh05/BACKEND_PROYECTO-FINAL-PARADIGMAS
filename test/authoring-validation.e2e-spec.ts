import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestHarness } from './helpers/test-app';

describe('Authoring HTTP validation', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let app: INestApplication;
  beforeAll(async () => {
    harness = await createTestHarness();
    app = await harness.startApp();
  });
  afterAll(async () => {
    if (harness) await harness.dispose();
  });

  it.each(
    [
      { title: '' },
      { title: null },
      { title: 'Q', authorId: 'spoof' },
      { title: 'Q', id: 'spoof' },
      [],
    ].map((body) => ({ body })),
  )(
    'returns the existing error envelope for an invalid body',
    async ({ body }) => {
      const response = await request(app.getHttpServer())
        .post('/kahoot-api/quizzes')
        .auth(harness.tokenA, { type: 'bearer' })
        .send(body)
        .expect(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        path: '/kahoot-api/quizzes',
      });
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('error');
    },
  );

  it('rejects malformed UUID route parameters', async () => {
    await request(app.getHttpServer())
      .get('/kahoot-api/quizzes/not-a-uuid')
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(400);
  });

  it('keeps unrelated health and root behavior intact', async () => {
    await request(app.getHttpServer()).get('/kahoot-api/health').expect(200);
    await request(app.getHttpServer()).get('/kahoot-api').expect(401);
  });
});
