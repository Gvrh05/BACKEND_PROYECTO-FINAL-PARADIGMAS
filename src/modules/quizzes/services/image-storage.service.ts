import {
  BadRequestException,
  Injectable,
  Logger,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  unlink,
  utimes,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type ValidatedQuestionImage = Express.Multer.File & {
  detectedMimeType: ImageMimeType;
};

@Injectable()
export class ImageStorage implements OnModuleInit {
  readonly root = resolve(process.env.UPLOADS_DEST || './public/uploads');
  readonly staging = join(this.root, '.staging');
  readonly maxFileSize = Number(process.env.MAX_FILE_SIZE ?? 5242880);
  private readonly logger = new Logger(ImageStorage.name);
  private activeDecoders = 0;
  private readonly waitingDecoders: Array<() => void> = [];
  private readonly activeStaging = new Set<string>();

  constructor() {
    if (!Number.isSafeInteger(this.maxFileSize) || this.maxFileSize < 1) {
      throw new Error('MAX_FILE_SIZE debe ser un entero positivo');
    }
    sharp.cache(false);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.staging, { recursive: true });
  }

  pathForKey(key: string): string {
    if (
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(jpg|png|webp)$/i.test(
        key,
      )
    ) {
      throw new Error('Clave de almacenamiento inválida');
    }
    return join(this.root, key);
  }

  async validate(file: Express.Multer.File): Promise<ImageMimeType> {
    if (!file.size) throw new BadRequestException('El archivo está vacío');
    return this.decodeLimited(async () => {
      const handle = await open(file.path, 'r');
      const header = Buffer.alloc(12);
      try {
        await handle.read(header, 0, header.length, 0);
      } finally {
        await handle.close();
      }
      const signature = header
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'image/png'
        : header.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          ? 'image/jpeg'
          : header.toString('ascii', 0, 4) === 'RIFF' &&
              header.toString('ascii', 8, 12) === 'WEBP'
            ? 'image/webp'
            : null;
      if (!signature || signature !== file.mimetype) {
        throw new UnsupportedMediaTypeException(
          'Se requiere JPEG, PNG o WebP con tipo y contenido coincidentes',
        );
      }
      try {
        const image = sharp(file.path, {
          limitInputPixels: 25000000,
          failOn: 'warning',
        });
        const metadata = await image.metadata();
        const expected =
          signature === 'image/jpeg'
            ? 'jpeg'
            : signature === 'image/png'
              ? 'png'
              : 'webp';
        if (metadata.format !== expected)
          throw new Error('Formato incompatible');
        await image.stats(); // Force actual decoding, not only a metadata/header check.
      } catch {
        throw new UnsupportedMediaTypeException(
          'Imagen inválida o superior a 25 megapíxeles',
        );
      }
      return signature;
    });
  }

  async promote(stagedPath: string, mime: ImageMimeType): Promise<string> {
    this.assertStagingPath(stagedPath);
    const extension =
      mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    const key = `${randomUUID()}.${extension}`;
    try {
      await rename(stagedPath, this.pathForKey(key));
      const now = new Date();
      await utimes(this.pathForKey(key), now, now);
    } catch (error) {
      await this.discard(key).catch(() =>
        this.logger.warn('Un archivo preparado quedó pendiente de barrido'),
      );
      throw error;
    }
    return key;
  }

  activateStaging(path: string): void {
    this.assertStagingPath(path);
    this.activeStaging.add(path);
  }
  releaseStaging(path: string): void {
    this.activeStaging.delete(path);
  }

  async staleCandidates(now = new Date()) {
    const threshold = now.getTime() - 24 * 60 * 60 * 1000;
    const keys: string[] = [];
    const stagedPaths: string[] = [];
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (
        !entry.isFile() ||
        !/^[\da-f-]{36}\.(jpg|png|webp)$/i.test(entry.name)
      )
        continue;
      const stat = await lstat(this.pathForKey(entry.name));
      if (stat.isFile() && stat.mtimeMs < threshold) keys.push(entry.name);
    }
    for (const entry of await readdir(this.staging, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[\da-f-]{36}\.upload$/i.test(entry.name))
        continue;
      const path = join(this.staging, entry.name);
      if (this.activeStaging.has(path)) continue;
      const stat = await lstat(path);
      if (stat.isFile() && stat.mtimeMs < threshold) stagedPaths.push(path);
    }
    return { keys, stagedPaths };
  }

  async discard(key: string): Promise<void> {
    try {
      await unlink(this.pathForKey(key));
    } catch (error) {
      if (!this.isMissing(error)) throw error;
    }
  }

  async discardStaged(path: string): Promise<void> {
    this.assertStagingPath(path);
    try {
      await unlink(path);
    } catch (error) {
      if (!this.isMissing(error))
        this.logger.warn(
          'No se pudo retirar un temporal; se recuperará en el barrido',
        );
    }
  }

  open(key: string) {
    return open(this.pathForKey(key), 'r');
  }

  private assertStagingPath(path: string) {
    if (resolve(dirname(path)) !== this.staging)
      throw new Error('Ruta temporal inválida');
  }

  private isMissing(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    );
  }

  private async decodeLimited<T>(work: () => Promise<T>): Promise<T> {
    if (this.activeDecoders >= 2)
      await new Promise<void>((release) => this.waitingDecoders.push(release));
    else this.activeDecoders++;
    try {
      return await work();
    } finally {
      const next = this.waitingDecoders.shift();
      if (next) next();
      else this.activeDecoders--;
    }
  }
}
