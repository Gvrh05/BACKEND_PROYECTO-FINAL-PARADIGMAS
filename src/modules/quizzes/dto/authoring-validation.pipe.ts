import {
  BadRequestException,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { UpdateQuizDto } from './update-quiz.dto';
import { UpdateQuestionDto } from './update-question.dto';

@Injectable()
export class AuthoringValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    });
  }

  async transform(value: unknown, metadata: ArgumentMetadata) {
    if (
      metadata.type === 'body' &&
      (value === null || typeof value !== 'object' || Array.isArray(value))
    ) {
      throw new BadRequestException('El cuerpo debe ser un objeto JSON');
    }
    const result: unknown = await super.transform(value, metadata);
    if (
      metadata.type === 'body' &&
      (metadata.metatype === UpdateQuizDto ||
        metadata.metatype === UpdateQuestionDto) &&
      (!result || !Object.values(result).some((field) => field !== undefined))
    ) {
      throw new BadRequestException(
        'PATCH requiere al menos un campo editable',
      );
    }
    return result;
  }
}
