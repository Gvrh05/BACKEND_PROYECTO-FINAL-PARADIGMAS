import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { CreateQuizDto } from '../dto/create-quiz.dto';
import { Quiz } from '../entities/quiz.entity';
import { serializeQuiz, serializeQuizDetail } from '../dto/resources';
import { UpdateQuizDto } from '../dto/update-quiz.dto';
import { Question } from '../entities/question.entity';
import { enqueueCleanup } from './enqueue-cleanup';

@Injectable()
export class QuizzesService {
  constructor(private readonly dataSource: DataSource) {}

  async create(userId: string, dto: CreateQuizDto) {
    const quiz = await this.dataSource.getRepository(Quiz).save({
      authorId: userId,
      title: dto.title,
      description: dto.description ?? null,
      coverImageUrl: dto.coverImageUrl ?? null,
    });
    return serializeQuiz(quiz);
  }

  async findAll(userId: string) {
    const quizzes = await this.dataSource.getRepository(Quiz).find({
      where: [{ authorId: userId }, { isDemo: true }],
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return quizzes.map(serializeQuiz);
  }

  async findOne(userId: string, id: string) {
    const quiz = await this.dataSource.getRepository(Quiz).findOne({
      where: [
        { id, authorId: userId },
        { id, isDemo: true },
      ],
      relations: { questions: { options: true } },
      order: {
        questions: {
          createdAt: 'ASC',
          id: 'ASC',
          options: { position: 'ASC' },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Cuestionario no encontrado');
    return serializeQuizDetail(quiz, quiz.questions);
  }

  async withOwnedQuiz<T>(
    userId: string,
    id: string,
    work: (manager: EntityManager, quiz: Quiz) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const quiz = await manager.getRepository(Quiz).findOne({
        where: { id, authorId: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!quiz) throw new NotFoundException('Cuestionario no encontrado');
      if (quiz.isDemo) {
        throw new ForbiddenException('El cuestionario demo es de solo lectura');
      }
      return work(manager, quiz);
    });
  }

  async update(userId: string, id: string, dto: UpdateQuizDto) {
    return this.withOwnedQuiz(userId, id, async (manager, quiz) => {
      if (dto.title !== undefined) quiz.title = dto.title;
      if (dto.description !== undefined) quiz.description = dto.description;
      if (dto.coverImageUrl !== undefined)
        quiz.coverImageUrl = dto.coverImageUrl;
      quiz.updatedAt = new Date();
      return serializeQuiz(await manager.save(Quiz, quiz));
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.withOwnedQuiz(userId, id, async (manager) => {
      const questions = await manager.find(Question, { where: { quizId: id } });
      await enqueueCleanup(
        manager,
        questions.flatMap((question) =>
          question.imageStorageKey ? [question.imageStorageKey] : [],
        ),
      );
      await manager.delete(Quiz, id);
    });
  }
}
