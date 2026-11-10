import {
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import type { FileHandle } from 'node:fs/promises';
import { Question } from '../entities/question.entity';
import { Quiz } from '../entities/quiz.entity';
import { serializeQuestion } from '../dto/resources';
import { ImageStorage } from './image-storage.service';
import type { ValidatedQuestionImage } from './image-storage.service';
import { QuestionsService } from './questions.service';
import { QuizzesService } from './quizzes.service';
import { enqueueCleanup } from './enqueue-cleanup';

@Injectable()
export class QuestionImagesService {
  private readonly logger = new Logger(QuestionImagesService.name);
  constructor(
    private readonly storage: ImageStorage,
    private readonly questions: QuestionsService,
    private readonly quizzes: QuizzesService,
  ) {}

  async store(
    userId: string,
    quizId: string,
    questionId: string,
    file: ValidatedQuestionImage,
  ) {
    let newKey: string | undefined;
    try {
      return await this.quizzes.withOwnedQuiz(
        userId,
        quizId,
        async (manager) => {
          const previous = await this.questions.loadOwned(
            userId,
            quizId,
            questionId,
            manager,
          );
          newKey = await this.storage.promote(file.path, file.detectedMimeType);
          await manager.update(Question, questionId, {
            imageStorageKey: newKey,
            imageUrl: `/uploads/questions/${newKey}`,
            imageMimeType: file.detectedMimeType,
            imageSize: file.size,
            updatedAt: new Date(),
          });
          await enqueueCleanup(
            manager,
            previous.imageStorageKey ? [previous.imageStorageKey] : [],
          );
          await manager.update(Quiz, quizId, { updatedAt: new Date() });
          return serializeQuestion(
            await this.questions.loadOwned(userId, quizId, questionId, manager),
          );
        },
      );
    } catch (error: unknown) {
      if (newKey)
        await this.storage
          .discard(newKey)
          .catch(() =>
            this.logger.warn(
              'No se pudo retirar un archivo descartado; se recuperará en el barrido',
            ),
          );
      throw error;
    }
  }

  async read(
    userId: string,
    quizId: string,
    questionId: string,
  ): Promise<StreamableFile> {
    let handle: FileHandle | undefined;
    try {
      const metadata = await this.quizzes.withOwnedQuiz(
        userId,
        quizId,
        async (manager) => {
          const question = await this.questions.loadOwned(
            userId,
            quizId,
            questionId,
            manager,
          );
          if (!question.imageStorageKey)
            throw new NotFoundException('Imagen no encontrada');
          try {
            handle = await this.storage.open(question.imageStorageKey);
          } catch (error: unknown) {
            if (
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              error.code === 'ENOENT'
            ) {
              this.logger.warn(
                'Una imagen asociada no está disponible en almacenamiento',
              );
              throw new NotFoundException('Imagen no encontrada');
            }
            throw error;
          }
          return { type: question.imageMimeType!, length: question.imageSize! };
        },
      );
      return new StreamableFile(handle!.createReadStream({ autoClose: true }), {
        ...metadata,
        disposition: 'inline',
      });
    } catch (error: unknown) {
      await handle?.close().catch(() => undefined);
      throw error;
    }
  }

  async remove(
    userId: string,
    quizId: string,
    questionId: string,
  ): Promise<void> {
    await this.quizzes.withOwnedQuiz(userId, quizId, async (manager) => {
      const question = await this.questions.loadOwned(
        userId,
        quizId,
        questionId,
        manager,
      );
      if (!question.imageStorageKey) return;
      await enqueueCleanup(manager, [question.imageStorageKey]);
      await manager.update(Question, questionId, {
        imageStorageKey: null,
        imageUrl: null,
        imageMimeType: null,
        imageSize: null,
        updatedAt: new Date(),
      });
      await manager.update(Quiz, quizId, { updatedAt: new Date() });
    });
  }
}
