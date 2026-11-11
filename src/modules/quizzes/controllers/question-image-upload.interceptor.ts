import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import multer, { diskStorage, MulterError } from 'multer';
import { lastValueFrom, of } from 'rxjs';
import { ImageStorage } from '../services/image-storage.service';
import type { ValidatedQuestionImage } from '../services/image-storage.service';

@Injectable()
export class QuestionImageUploadInterceptor implements NestInterceptor {
  constructor(private readonly storage: ImageStorage) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const temporaryPaths: string[] = [];
    const receive = multer({
      storage: diskStorage({
        destination: this.storage.staging,
        filename: (_req, _file, done) => {
          const name = `${randomUUID()}.upload`;
          const path = join(this.storage.staging, name);
          this.storage.activateStaging(path);
          temporaryPaths.push(path);
          done(null, name);
        },
      }),
      limits: {
        fileSize: this.storage.maxFileSize,
        files: 1,
        fields: 0,
        parts: 2,
      },
    }).single('image');
    try {
      await new Promise<void>((accept, reject) =>
        receive(request, response, (error: unknown) => {
          if (!error) return accept();
          if (error instanceof MulterError) {
            return reject(
              error.code === 'LIMIT_FILE_SIZE'
                ? new PayloadTooLargeException(
                    'La imagen supera el límite de bytes',
                  )
                : new BadRequestException(
                    'Se requiere exactamente un archivo en image, sin campos adicionales',
                  ),
            );
          }
          if (
            typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            [
              'Unexpected end of form',
              'Unexpected end of file',
              'Multipart: Boundary not found',
              'Malformed part header',
            ].includes(String(error.message))
          ) {
            return reject(new BadRequestException('Multipart inválido'));
          }
          reject(new Error('No se pudo recibir el archivo', { cause: error }));
        }),
      );
      if (!request.file)
        throw new BadRequestException('El archivo image es obligatorio');
      const file = request.file as ValidatedQuestionImage;
      file.detectedMimeType = await this.storage.validate(file);
      return of(await lastValueFrom(next.handle()));
    } finally {
      for (const path of temporaryPaths) {
        await this.storage.discardStaged(path);
        this.storage.releaseStaging(path);
      }
    }
  }
}
