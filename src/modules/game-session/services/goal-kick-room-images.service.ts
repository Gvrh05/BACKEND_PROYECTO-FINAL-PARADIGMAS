import {
  HttpException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';

/** Small transient room covers: no files, database records or user supplied URLs. */
@Injectable()
export class GoalKickRoomImages {
  private active = 0;

  async prepare(file?: Express.Multer.File): Promise<Buffer | undefined> {
    if (!file) return undefined;
    if (this.active >= 2)
      throw new HttpException(
        'Intenta cargar la foto de nuevo en unos segundos',
        429,
      );
    this.active++;
    try {
      if (!file.buffer?.length || file.size > 5 * 1024 * 1024)
        throw new Error('Invalid size');
      const image = sharp(file.buffer, {
        limitInputPixels: 25000000,
        failOn: 'warning',
      });
      const metadata = await image.metadata();
      const formats: Record<string, string> = {
        'image/jpeg': 'jpeg',
        'image/png': 'png',
        'image/webp': 'webp',
      };
      const expected = formats[file.mimetype];
      if (
        !expected ||
        metadata.format !== expected ||
        (metadata.pages ?? 1) !== 1
      )
        throw new Error('Invalid format');
      const cover = await image
        .resize({
          width: 960,
          height: 540,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 70 })
        .toBuffer();
      if (cover.length > 512 * 1024) throw new Error('Cover too large');
      return cover;
    } catch {
      throw new UnsupportedMediaTypeException(
        'Usa una imagen JPEG, PNG o WebP válida, de hasta 5 MiB y 25 megapíxeles',
      );
    } finally {
      this.active--;
    }
  }
}
