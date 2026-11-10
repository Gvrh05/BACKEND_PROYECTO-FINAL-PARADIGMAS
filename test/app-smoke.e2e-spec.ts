import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('AppController isolated smoke (no database)', () => {
  it('preserves Hello World independently of Postgres and the global auth integration', async () => {
    const module = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    const app = module.createNestApplication();
    try {
      await app.init();
      await request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Hello World!');
    } finally {
      await app.close();
    }
  });
});
