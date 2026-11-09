import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { createTestDatabase } from './test-database';

export async function createTestHarness() {
  const database = await createTestDatabase();
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Temp', 'opencode')
    : tmpdir();
  await mkdir(base, { recursive: true });
  const uploads = await mkdtemp(join(base, 'kahoot-uploads-test-'));
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    UPLOADS_DEST: process.env.UPLOADS_DEST,
    MAX_FILE_SIZE: process.env.MAX_FILE_SIZE,
  };
  process.env.DATABASE_URL = database.url;
  process.env.JWT_SECRET = 'quiz-authoring-tests-only';
  process.env.UPLOADS_DEST = uploads;
  process.env.MAX_FILE_SIZE = '5242880';
  const userA = randomUUID();
  const userB = randomUUID();
  const tokenFor = (id: string) =>
    jwt.sign(
      { sub: id, username: 'test-user', role: 'PROFESOR' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h', algorithm: 'HS256' },
    );
  const apps = new Set<INestApplication>();
  return {
    ...database,
    uploads,
    userA,
    userB,
    tokenA: tokenFor(userA),
    tokenB: tokenFor(userB),
    async startApp() {
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      const app = module.createNestApplication();
      apps.add(app);
      app.useLogger(false);
      configureApp(app);
      await app.init();
      // Bind once; concurrent Supertest requests must not each bind this server.
      await app.listen(0, '127.0.0.1');
      return app;
    },
    async closeApp(app: INestApplication) {
      await app.close();
      apps.delete(app);
    },
    async dispose() {
      try {
        for (const app of apps) await app.close();
        await database.dispose();
        await rm(uploads, { recursive: true, force: true });
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  };
}
