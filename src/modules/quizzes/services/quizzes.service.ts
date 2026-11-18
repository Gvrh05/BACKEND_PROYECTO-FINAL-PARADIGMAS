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
import { QuestionKind } from '../entities/question.entity';
import { QuestionOption } from '../entities/question-option.entity';
import { enqueueCleanup } from './enqueue-cleanup';
import { quizAuthorId } from '../../../shared/database/punto3-demo-owner';
import { copyFile, mkdir, stat, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  DEFAULT_POKEMON_QUIZ_ID,
  POKEMON_ASSETS,
  pokemonQuestions,
} from './pokemon-catalog';
import {
  DEFAULT_DRAGONBALL_QUIZ_ID,
  DRAGONBALL_ASSETS,
  dragonballQuestions,
} from './dragonball-catalog';

const starterQuizzes = [
  {
    id: DEFAULT_POKEMON_QUIZ_ID,
    title: 'Pokémon · Desafío de la Pokédex',
    description:
      'Pon a prueba tus conocimientos sobre estadísticas base, tipos combinados y características de 10 Pokémon. 20 preguntas ilustradas sobre sus formas estándar.',
    assets: POKEMON_ASSETS,
    questions: pokemonQuestions,
  },
  {
    id: DEFAULT_DRAGONBALL_QUIZ_ID,
    title: 'Dragon Ball · Desafío de los Guerreros Z',
    description:
      'Recorre las historias de Goku, Vegeta y los Guerreros Z con 20 preguntas ilustradas sobre sus familias, aliados, enemigos y transformaciones.',
    assets: DRAGONBALL_ASSETS,
    questions: dragonballQuestions,
  },
];
const starterConditions = starterQuizzes.map(({ id }) => ({
  id,
  isDemo: true,
}));

@Injectable()
export class QuizzesService {
  constructor(private readonly dataSource: DataSource) {}

  async findOneByOwner(quizId: string, ownerId: string): Promise<Quiz | null> {
    const authorId = quizAuthorId(ownerId);
    if (!authorId) return null;
    const repository = this.dataSource.getRepository(Quiz);
    const starter = starterQuizzes.find((item) => item.id === quizId);
    if (starter) {
      await this.saveStarterQuiz(starter.id, starter, true);
      return repository.findOneBy({ id: quizId, isDemo: true });
    }
    return repository.findOneBy({ id: quizId, authorId });
  }

  async existsAndOwnedBy(quizId: string, ownerId: string): Promise<boolean> {
    const authorId = quizAuthorId(ownerId);
    return authorId
      ? this.dataSource.getRepository(Quiz).existsBy({ id: quizId, authorId })
      : false;
  }

  async findAllByOwner(ownerId: string): Promise<Quiz[]> {
    const authorId = quizAuthorId(ownerId);
    if (!authorId) return [];
    await this.ensureStarterQuizzes();
    return this.dataSource.getRepository(Quiz).find({
      where: [{ authorId }, ...starterConditions],
      order: { createdAt: 'ASC' },
    });
  }

  async create(userId: string, dto: CreateQuizDto) {
    const quiz = await this.dataSource.getRepository(Quiz).save({
      authorId: userId,
      title: dto.title,
      description: dto.description ?? null,
      coverImageUrl: dto.coverImageUrl ?? null,
    });
    return serializeQuiz(quiz);
  }

  async createPokemonQuiz(userId: string) {
    return serializeQuiz(await this.saveStarterQuiz(userId, starterQuizzes[0]));
  }

  private async ensureStarterQuizzes() {
    for (const starter of starterQuizzes) {
      await this.saveStarterQuiz(starter.id, starter, true);
    }
  }

  private async saveStarterQuiz(
    userId: string,
    catalog: (typeof starterQuizzes)[number],
    starter = false,
  ): Promise<Quiz> {
    const plans = await catalog.questions();
    const files: string[] = [];
    const folder = resolve(
      process.env.UPLOADS_DEST || './uploads',
      'questions',
    );
    await mkdir(folder, { recursive: true });
    try {
      return await this.dataSource.transaction(async (manager) => {
        if (starter) {
          // Every concurrent first login shares one complete starter quiz.
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            catalog.id,
          ]);
          const existing = await manager.findOneBy(Quiz, {
            id: catalog.id,
          });
          if (existing) {
            const questions = await manager.find(Question, {
              where: { quizId: existing.id },
              relations: { options: true },
              order: { createdAt: 'ASC', id: 'ASC' },
            });
            const unchanged =
              questions.length === plans.length &&
              questions.every((question, index) => {
                const plan = plans[index];
                const options = [...question.options].sort(
                  (a, b) => a.position - b.position,
                );
                return (
                  question.questionText === plan.text &&
                  question.kind ===
                    (plan.binary
                      ? QuestionKind.TRUE_FALSE
                      : QuestionKind.MULTIPLE_CHOICE) &&
                  options.length === plan.options.length &&
                  options.every(
                    (option, position) =>
                      option.text === plan.options[position] &&
                      option.isCorrect === (position === plan.correctIndex),
                  )
                );
              });
            if (!unchanged) {
              // Only the fixed, read-only starter is refreshed. Existing live games use snapshots.
              await enqueueCleanup(
                manager,
                questions.flatMap((question) =>
                  question.imageStorageKey ? [question.imageStorageKey] : [],
                ),
              );
              await manager.delete(Question, { quizId: existing.id });
            } else {
              for (const question of questions) {
                const plan = plans.find(
                  (item) => item.text === question.questionText,
                );
                if (!plan || !question.imageStorageKey) continue;
                const target = join(folder, question.imageStorageKey);
                try {
                  await stat(target);
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                    throw error;
                  await copyFile(join(catalog.assets, plan.image), target);
                }
              }
              if (
                existing.title !== catalog.title ||
                existing.description !== catalog.description
              ) {
                await manager.update(Quiz, existing.id, {
                  title: catalog.title,
                  description: catalog.description,
                });
              }
              return {
                ...existing,
                title: catalog.title,
                description: catalog.description,
              };
            }
          }
        }
        const created = await manager.save(Quiz, {
          ...(starter && { id: catalog.id }),
          authorId: userId,
          isDemo: starter,
          title: catalog.title,
          description: catalog.description,
        });
        for (const [index, plan] of plans.entries()) {
          const filename = randomUUID() + '.png';
          const target = join(folder, filename);
          files.push(target);
          await copyFile(join(catalog.assets, plan.image), target);
          const metadata = await stat(target);
          const question = await manager.save(Question, {
            quizId: created.id,
            kind: plan.binary
              ? QuestionKind.TRUE_FALSE
              : QuestionKind.MULTIPLE_CHOICE,
            questionText: plan.text,
            timeLimitSeconds: plan.binary ? 25 : 35,
            points: 1000,
            createdAt: new Date(Date.now() + index),
            imageStorageKey: filename,
            imageUrl: '/uploads/questions/' + filename,
            imageMimeType: 'image/png',
            imageSize: metadata.size,
          });
          await manager.save(
            QuestionOption,
            plan.options.map((text, position) => ({
              questionId: question.id,
              position,
              text,
              isCorrect: position === plan.correctIndex,
            })),
          );
        }
        return created;
      });
    } catch (error) {
      await Promise.all(files.map((file) => rm(file, { force: true })));
      throw error;
    }
  }

  async findAll(userId: string) {
    await this.ensureStarterQuizzes();
    const quizzes = await this.dataSource.getRepository(Quiz).find({
      where: [{ authorId: userId }, ...starterConditions],
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return quizzes.map(serializeQuiz);
  }

  async findOne(userId: string, id: string) {
    const quiz = await this.dataSource.getRepository(Quiz).findOne({
      where: [
        { id, authorId: quizAuthorId(userId) ?? userId },
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
