import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Quiz } from '../entities/quiz.entity';
import { Question } from '../entities/question.entity';
import { QuestionOption } from '../entities/question-option.entity';
import { AddQuestionDto } from '../dto/add-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';
import { serializeQuestion } from '../dto/resources';
import { QuizzesService } from './quizzes.service';
import { enqueueCleanup } from './enqueue-cleanup';
import { APP_CONFIG } from '../../../shared/utils/constants';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly quizzes: QuizzesService,
  ) {}

  async loadOwned(
    userId: string,
    quizId: string,
    id: string,
    manager = this.dataSource.manager,
  ): Promise<Question> {
    const question = await manager.getRepository(Question).findOne({
      where: { id, quizId, quiz: { authorId: userId } },
      relations: { options: true },
    });
    if (!question) throw new NotFoundException('Pregunta no encontrada');
    return question;
  }

  async findAll(userId: string, quizId: string) {
    if (
      !(await this.dataSource
        .getRepository(Quiz)
        .existsBy({ id: quizId, authorId: userId }))
    ) {
      throw new NotFoundException('Cuestionario no encontrado');
    }
    const questions = await this.dataSource.getRepository(Question).find({
      where: { quizId, quiz: { authorId: userId } },
      relations: { options: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return questions.map(serializeQuestion);
  }

  async findOne(userId: string, quizId: string, id: string) {
    return serializeQuestion(await this.loadOwned(userId, quizId, id));
  }

  async create(userId: string, quizId: string, dto: AddQuestionDto) {
    return this.quizzes.withOwnedQuiz(userId, quizId, async (manager) => {
      const question = await manager.save(Question, {
        quizId,
        questionText: dto.questionText,
        timeLimitSeconds:
          dto.timeLimitSeconds ?? APP_CONFIG.DEFAULT_QUESTION_TIME_LIMIT,
        points: dto.points ?? APP_CONFIG.DEFAULT_QUESTION_POINTS,
      });
      await this.saveOptions(manager, question.id, dto.options);
      await this.touchQuiz(manager, quizId);
      return serializeQuestion(
        await this.loadOwned(userId, quizId, question.id, manager),
      );
    });
  }

  async update(
    userId: string,
    quizId: string,
    id: string,
    dto: UpdateQuestionDto,
  ) {
    return this.quizzes.withOwnedQuiz(userId, quizId, async (manager) => {
      await this.loadOwned(userId, quizId, id, manager);
      const fields: Partial<Question> = { updatedAt: new Date() };
      if (dto.questionText !== undefined)
        fields.questionText = dto.questionText;
      if (dto.timeLimitSeconds !== undefined)
        fields.timeLimitSeconds = dto.timeLimitSeconds;
      if (dto.points !== undefined) fields.points = dto.points;
      await manager.update(Question, id, fields);
      if (dto.options !== undefined) {
        await manager.delete(QuestionOption, { questionId: id });
        await this.saveOptions(manager, id, dto.options);
      }
      await this.touchQuiz(manager, quizId);
      return serializeQuestion(
        await this.loadOwned(userId, quizId, id, manager),
      );
    });
  }

  async remove(userId: string, quizId: string, id: string): Promise<void> {
    await this.quizzes.withOwnedQuiz(userId, quizId, async (manager) => {
      const question = await this.loadOwned(userId, quizId, id, manager);
      await enqueueCleanup(
        manager,
        question.imageStorageKey ? [question.imageStorageKey] : [],
      );
      await manager.delete(Question, id);
      await this.touchQuiz(manager, quizId);
    });
  }

  private async saveOptions(
    manager: EntityManager,
    questionId: string,
    options: AddQuestionDto['options'],
  ) {
    await manager.save(
      QuestionOption,
      options.map((option, position) => ({
        questionId,
        position,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    );
  }

  private async touchQuiz(manager: EntityManager, quizId: string) {
    await manager.update(Quiz, quizId, { updatedAt: new Date() });
  }
}
