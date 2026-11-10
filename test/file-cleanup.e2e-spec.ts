import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { join } from 'node:path';
import { readFile, utimes, writeFile } from 'node:fs/promises';
import request from 'supertest';
import sharp from 'sharp';
import { Question } from '../src/modules/quizzes/entities/question.entity';
import { FileCleanupJob } from '../src/modules/quizzes/entities/file-cleanup-job.entity';
import { ImageStorage } from '../src/modules/quizzes/services/image-storage.service';
import { FileCleanupWorker } from '../src/modules/quizzes/services/file-cleanup.worker';
import { createTestHarness } from './helpers/test-app';
import { questionBody } from './helpers/quiz-fixtures';

describe('Persistent image cleanup', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let app: INestApplication;
  let storage: ImageStorage;
  let worker: FileCleanupWorker;
  let png: Buffer;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    harness = await createTestHarness();
    app = await harness.startApp();
    storage = app.get(ImageStorage);
    worker = app.get(FileCleanupWorker);
    png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
  });
  afterAll(async () => {
    if (harness) await harness.dispose();
  });

  async function image() {
    const { body: quiz } = await http()
      .post('/kahoot-api/quizzes')
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ title: 'Limpieza' })
      .expect(201);
    const { body: question } = await http()
      .post(`/kahoot-api/quizzes/${quiz.id}/questions`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send(questionBody())
      .expect(201);
    const path = `/kahoot-api/quizzes/${quiz.id}/questions/${question.id}/image`;
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', png, 'test.png')
      .expect(200);
    const stored = await harness.dataSource
      .getRepository(Question)
      .findOneByOrFail({ id: question.id });
    return { path, key: stored.imageStorageKey! };
  }

  it('persists a failed unlink and retries successfully after an application restart', async () => {
    const { path, key } = await image();
    await http()
      .delete(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(204);
    const failure = jest
      .spyOn(storage, 'discard')
      .mockRejectedValueOnce(
        Object.assign(new Error('busy'), { code: 'EBUSY' }),
      );
    try {
      await worker.runOnce();
    } finally {
      failure.mockRestore();
    }
    const pending = await harness.dataSource
      .getRepository(FileCleanupJob)
      .findOneByOrFail({ storageKey: key });
    expect(pending.attempts).toBe(1);
    expect(await readFile(storage.pathForKey(key))).toEqual(png);
    await http().get(path).auth(harness.tokenA, { type: 'bearer' }).expect(404);
    await harness.closeApp(app);
    app = await harness.startApp();
    storage = app.get(ImageStorage);
    worker = app.get(FileCleanupWorker);
    expect(
      await harness.dataSource
        .getRepository(FileCleanupJob)
        .countBy({ storageKey: key }),
    ).toBe(1);
    await worker.runOnce(new Date(pending.nextAttemptAt.getTime() + 1000));
    expect(
      await harness.dataSource
        .getRepository(FileCleanupJob)
        .countBy({ storageKey: key }),
    ).toBe(0);
    await expect(readFile(storage.pathForKey(key))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('treats an already-absent file as a successful idempotent deletion', async () => {
    const key = `${randomUUID()}.png`;
    await harness.dataSource
      .getRepository(FileCleanupJob)
      .save({ storageKey: key });
    await Promise.all([worker.runOnce(), worker.runOnce()]);
    expect(
      await harness.dataSource
        .getRepository(FileCleanupJob)
        .countBy({ storageKey: key }),
    ).toBe(0);
  });

  it('never deletes an active image even if a stale cleanup job exists', async () => {
    const { path, key } = await image();
    await harness.dataSource
      .getRepository(FileCleanupJob)
      .save({ storageKey: key });
    await worker.runOnce();
    expect(await readFile(storage.pathForKey(key))).toEqual(png);
    await http().get(path).auth(harness.tokenA, { type: 'bearer' }).expect(200);
    expect(
      await harness.dataSource
        .getRepository(FileCleanupJob)
        .countBy({ storageKey: key }),
    ).toBe(0);
  });

  it('sweeps only old orphan files/temporaries and preserves recent or active files', async () => {
    const { key: activeKey } = await image();
    const orphan = `${randomUUID()}.png`;
    const recent = `${randomUUID()}.png`;
    const staleTemp = join(storage.staging, `${randomUUID()}.upload`);
    const activeTemp = join(storage.staging, `${randomUUID()}.upload`);
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    for (const path of [
      storage.pathForKey(orphan),
      storage.pathForKey(recent),
      staleTemp,
      activeTemp,
    ])
      await writeFile(path, png);
    for (const path of [
      storage.pathForKey(orphan),
      storage.pathForKey(activeKey),
      staleTemp,
      activeTemp,
    ])
      await utimes(path, old, old);
    storage.activateStaging(activeTemp);
    try {
      await worker.runOnce();
      expect(
        await harness.dataSource
          .getRepository(FileCleanupJob)
          .countBy({ storageKey: orphan }),
      ).toBe(1);
      await expect(readFile(staleTemp)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await worker.runOnce();
      await expect(readFile(storage.pathForKey(orphan))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      for (const path of [
        storage.pathForKey(activeKey),
        storage.pathForKey(recent),
        activeTemp,
      ])
        expect(await readFile(path)).toEqual(png);
    } finally {
      storage.releaseStaging(activeTemp);
    }
  });
});
