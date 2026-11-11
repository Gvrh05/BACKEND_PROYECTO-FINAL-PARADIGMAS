import type { INestApplication } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import request from 'supertest';
import sharp from 'sharp';
import { Question } from '../src/modules/quizzes/entities/question.entity';
import { FileCleanupJob } from '../src/modules/quizzes/entities/file-cleanup-job.entity';
import { ImageStorage } from '../src/modules/quizzes/services/image-storage.service';
import { createTestHarness } from './helpers/test-app';
import { questionBody } from './helpers/quiz-fixtures';
import openapi from '../docs/openapi.json';

describe('Private question images', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let app: INestApplication;
  let storage: ImageStorage;
  let png: Buffer;
  let jpeg: Buffer;
  let webp: Buffer;
  const root = '/kahoot-api/quizzes';
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    harness = await createTestHarness();
    app = await harness.startApp();
    storage = app.get(ImageStorage);
    const input = {
      create: {
        width: 8,
        height: 8,
        channels: 3 as const,
        background: '#ff0000',
      },
    };
    png = await sharp(input).png().toBuffer();
    jpeg = await sharp(input).jpeg().toBuffer();
    webp = await sharp(input).webp().toBuffer();
  });
  afterAll(async () => {
    if (harness) await harness.dispose();
  });
  async function resources() {
    const { body: quiz } = await http()
      .post(root)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ title: 'Imágenes' })
      .expect(201);
    const { body: question } = await http()
      .post(`${root}/${quiz.id}/questions`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send(questionBody())
      .expect(201);
    return {
      quiz,
      question,
      path: `${root}/${quiz.id}/questions/${question.id}/image`,
    };
  }

  it('accepts real JPEG, PNG and WebP and ignores client-supplied paths', async () => {
    for (const [bytes, mime, filename] of [
      [jpeg, 'image/jpeg', '../../outside.jpg'],
      [png, 'image/png', '..\\outside.png'],
      [webp, 'image/webp', 'outside.webp'],
    ] as const) {
      const { question, path } = await resources();
      const { body } = await http()
        .post(path)
        .auth(harness.tokenA, { type: 'bearer' })
        .attach('image', bytes, { filename, contentType: mime })
        .expect(200);
      expect(body.imageUrl).toMatch(
        /^\/uploads\/questions\/[\da-f-]{36}\.(jpg|png|webp)$/i,
      );
      const stored = await harness.dataSource
        .getRepository(Question)
        .findOneByOrFail({ id: question.id });
      expect(stored.imageStorageKey).toMatch(/^[\da-f-]{36}\.(jpg|png|webp)$/);
      expect(stored.imageMimeType).toBe(mime);
      expect(
        await readFile(storage.pathForKey(stored.imageStorageKey!)),
      ).toEqual(bytes);
      expect(await readdir(storage.staging)).toEqual([]);
    }
  });

  it('rejects absent, empty, multiple and wrongly named file parts', async () => {
    const { question, path } = await resources();
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({})
      .expect(400);
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', Buffer.alloc(0), {
        filename: 'empty.png',
        contentType: 'image/png',
      })
      .expect(400);
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', png, 'one.png')
      .attach('image', png, 'two.png')
      .expect(400);
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('other', png, 'other.png')
      .expect(400);
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .set('Content-Type', 'multipart/form-data; boundary=broken')
      .send('--broken\r\ninvalid')
      .expect(400);
    expect(
      (
        await harness.dataSource
          .getRepository(Question)
          .findOneByOrFail({ id: question.id })
      ).imageStorageKey,
    ).toBeNull();
    expect(await readdir(storage.staging)).toEqual([]);
  });

  it('rejects excessive bytes, spoofed types, SVG and excessive dimensions', async () => {
    const { path } = await resources();
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', Buffer.alloc(5242881), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', png, {
        filename: 'spoof.jpg',
        contentType: 'image/jpeg',
      })
      .expect(415);
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach(
        'image',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        { filename: 'vector.svg', contentType: 'image/svg+xml' },
      )
      .expect(415);
    const dimensions = await sharp({
      create: { width: 5001, height: 5000, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    expect(dimensions.length).toBeLessThan(5242880);
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', dimensions, {
        filename: 'dimensions.png',
        contentType: 'image/png',
      })
      .expect(415);
    expect(await readdir(storage.staging)).toEqual([]);
  });

  it('checks ownership before receiving or decoding any upload', async () => {
    const { path } = await resources();
    const validate = jest.spyOn(storage, 'validate');
    try {
      await http()
        .put(path)
        .auth(harness.tokenB, { type: 'bearer' })
        .attach('image', png, 'private.png')
        .expect(404);
      await http().put(path).attach('image', png, 'private.png').expect(401);
      expect(validate).not.toHaveBeenCalled();
      expect(await readdir(storage.staging)).toEqual([]);
    } finally {
      validate.mockRestore();
    }
  });

  it('keeps the previous image when writing a replacement fails', async () => {
    const { question, path } = await resources();
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', png, 'before.png')
      .expect(200);
    const before = await harness.dataSource
      .getRepository(Question)
      .findOneByOrFail({ id: question.id });
    const failWrite = jest
      .spyOn(storage, 'promote')
      .mockRejectedValueOnce(new Error('induced storage failure'));
    try {
      await http()
        .put(path)
        .auth(harness.tokenA, { type: 'bearer' })
        .attach('image', jpeg, 'after.jpg')
        .expect(500);
      const after = await harness.dataSource
        .getRepository(Question)
        .findOneByOrFail({ id: question.id });
      expect(after.imageStorageKey).toBe(before.imageStorageKey);
      expect(
        await readFile(storage.pathForKey(after.imageStorageKey!)),
      ).toEqual(png);
      expect(await readdir(storage.staging)).toEqual([]);
    } finally {
      failWrite.mockRestore();
    }
  });

  it('removes the prepared new file and keeps the previous association on database failure', async () => {
    const { question, path } = await resources();
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', png, 'before.png')
      .expect(200);
    const before = await harness.dataSource
      .getRepository(Question)
      .findOneByOrFail({ id: question.id });
    const filesBefore = (await readdir(storage.root)).sort();
    const s = `"${harness.schema}"`;
    await harness.dataSource
      .query(`CREATE FUNCTION ${s}.fail_image_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'induced image update failure'; END; $$;
      CREATE CONSTRAINT TRIGGER fail_image AFTER UPDATE ON ${s}.questions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.id = '${question.id}' AND NEW.image_storage_key IS DISTINCT FROM OLD.image_storage_key) EXECUTE FUNCTION ${s}.fail_image_update()`);
    try {
      await http()
        .put(path)
        .auth(harness.tokenA, { type: 'bearer' })
        .attach('image', jpeg, 'after.jpg')
        .expect(500);
      expect(
        (
          await harness.dataSource
            .getRepository(Question)
            .findOneByOrFail({ id: question.id })
        ).imageStorageKey,
      ).toBe(before.imageStorageKey);
      expect((await readdir(storage.root)).sort()).toEqual(filesBefore);
    } finally {
      await harness.dataSource.query(
        `DROP TRIGGER fail_image ON ${s}.questions; DROP FUNCTION ${s}.fail_image_update()`,
      );
    }
  });

  it('serializes concurrent replacements to one active image and queues discarded files', async () => {
    const { question, path } = await resources();
    await Promise.all([
      http()
        .put(path)
        .auth(harness.tokenA, { type: 'bearer' })
        .attach('image', png, 'one.png')
        .expect(200),
      http()
        .put(path)
        .auth(harness.tokenA, { type: 'bearer' })
        .attach('image', jpeg, 'two.jpg')
        .expect(200),
    ]);
    const stored = await harness.dataSource
      .getRepository(Question)
      .findOneByOrFail({ id: question.id });
    expect(stored.imageStorageKey).not.toBeNull();
    const bytes = await readFile(storage.pathForKey(stored.imageStorageKey!));
    expect(bytes.equals(png) || bytes.equals(jpeg)).toBe(true);
    expect(
      await harness.dataSource.getRepository(FileCleanupJob).count(),
    ).toBeGreaterThan(0);
    expect(await readdir(storage.staging)).toEqual([]);
  });

  it('keeps the owner endpoint protected and also serves uploaded files publicly', async () => {
    const { question, path } = await resources();
    await http().get(path).auth(harness.tokenA, { type: 'bearer' }).expect(404);
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', png, 'private.png')
      .expect(200);
    const response = await http()
      .get(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200)
      .expect('Content-Type', 'image/png')
      .expect('Cache-Control', 'private, no-store')
      .expect('X-Content-Type-Options', 'nosniff');
    expect(response.body).toEqual(png);
    expect(
      openapi.paths['/quizzes/{quizId}/questions/{questionId}/image'].get
        .responses['200'].content,
    ).toHaveProperty('image/png');
    expect(path).not.toContain('token=');
    await http().get(path).expect(401);
    await http().get(path).auth(harness.tokenB, { type: 'bearer' }).expect(404);
    const { body: another } = await http()
      .post(root)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ title: 'Otro' })
      .expect(201);
    await http()
      .get(`${root}/${another.id}/questions/${question.id}/image`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(404);
    const stored = await harness.dataSource
      .getRepository(Question)
      .findOneByOrFail({ id: question.id });
    const publicPath = `/uploads/questions/${stored.imageStorageKey}`;
    const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';
    const publicImage = await http()
      .get(publicPath)
      .set('Origin', origin)
      .expect(200)
      .expect('Access-Control-Allow-Origin', origin)
      .expect('Content-Type', 'image/png');
    expect(publicImage.body).toEqual(png);
    expect(publicPath).toBe(
      (
        await http()
          .get(`${root}/${question.quizId}/questions/${question.id}`)
          .auth(harness.tokenA, { type: 'bearer' })
          .expect(200)
      ).body.imageUrl,
    );
    for (const route of [
      `/public/uploads/${stored.imageStorageKey}`,
      `/uploads/${stored.imageStorageKey}`,
      `/kahoot-api/uploads/${stored.imageStorageKey}`,
    ]) {
      await http().get(route).expect(404);
    }
    await storage.discard(stored.imageStorageKey!);
    const missing = await http()
      .get(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(404);
    expect(JSON.stringify(missing.body)).not.toContain(storage.root);
    await http().get(publicPath).expect(404);
  });

  it('removes only an image idempotently and revokes access before disk cleanup', async () => {
    const { question, path } = await resources();
    await http()
      .delete(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(204);
    await http()
      .put(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .attach('image', png, 'remove.png')
      .expect(200);
    const before = await harness.dataSource
      .getRepository(Question)
      .findOneByOrFail({ id: question.id });
    await http()
      .delete(path)
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(404);
    await http().delete(path).expect(401);
    await http().get(path).auth(harness.tokenA, { type: 'bearer' }).expect(200);
    await http()
      .delete(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(204);
    await http()
      .delete(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(204);
    await http().get(path).auth(harness.tokenA, { type: 'bearer' }).expect(404);
    const { body: after } = await http()
      .get(path.slice(0, -6))
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200);
    expect(after).toMatchObject({
      id: question.id,
      imageUrl: null,
      questionText: question.questionText,
      options: question.options,
    });
    expect(
      await harness.dataSource
        .getRepository(FileCleanupJob)
        .countBy({ storageKey: before.imageStorageKey! }),
    ).toBe(1);
    expect(await readFile(storage.pathForKey(before.imageStorageKey!))).toEqual(
      png,
    );
  });

  it.each(['question', 'quiz'])(
    'revokes and queues an image when its %s is deleted',
    async (parent) => {
      const { quiz, question, path } = await resources();
      await http()
        .put(path)
        .auth(harness.tokenA, { type: 'bearer' })
        .attach('image', png, 'cascade.png')
        .expect(200);
      const before = await harness.dataSource
        .getRepository(Question)
        .findOneByOrFail({ id: question.id });
      const target =
        parent === 'quiz' ? `${root}/${quiz.id}` : path.slice(0, -6);
      await http()
        .delete(target)
        .auth(harness.tokenA, { type: 'bearer' })
        .expect(204);
      await http()
        .get(path)
        .auth(harness.tokenA, { type: 'bearer' })
        .expect(404);
      expect(
        await harness.dataSource
          .getRepository(FileCleanupJob)
          .countBy({ storageKey: before.imageStorageKey! }),
      ).toBe(1);
    },
  );
});
