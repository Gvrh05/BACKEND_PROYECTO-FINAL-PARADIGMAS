import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.setup';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('Deployment: API reference and browser CORS (no database)', () => {
  it('serves public docs and allows exactly the configured origins', async () => {
    const previous = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN =
      'https://classroom.netlify.app, http://localhost:5173';
    const module = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    const app = module.createNestApplication();
    try {
      configureApp(app);
      await app.init();
      const http = request(app.getHttpServer());
      for (const path of [
        '/kahoot-api/docs',
        '/kahoot-api/docs/openapi.json',
        '/kahoot-api/health',
      ]) {
        await http
          .get(path)
          .set('Origin', 'https://classroom.netlify.app')
          .expect(200)
          .expect(
            'Access-Control-Allow-Origin',
            'https://classroom.netlify.app',
          );
      }
      await http
        .get('/kahoot-api/docs/openapi.json')
        .expect('Content-Type', /json/);
      await http
        .options('/kahoot-api/quizzes')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204)
        .expect('Access-Control-Allow-Origin', 'http://localhost:5173');
      const blocked = await http
        .get('/kahoot-api/health')
        .set('Origin', 'https://untrusted.example');
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
      if (previous === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = previous;
    }
  });
});
