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
import { PokeApiService, type PokemonFact } from './poke-api.service';

const TYPE_NAMES: Record<string, string> = {
  bug: 'bicho', dark: 'siniestro', dragon: 'dragón', electric: 'eléctrico',
  fairy: 'hada', fighting: 'lucha', fire: 'fuego', flying: 'volador',
  ghost: 'fantasma', grass: 'planta', ground: 'tierra', ice: 'hielo',
  normal: 'normal', poison: 'veneno', psychic: 'psíquico', rock: 'roca',
  steel: 'acero', water: 'agua',
};
const FALSE_TYPES = ['fire', 'water', 'electric', 'grass', 'psychic', 'ghost'];

@Injectable()
export class QuizzesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pokeApi: PokeApiService,
  ) {}

  async findOneByOwner(quizId: string, ownerId: string): Promise<Quiz | null> {
    const authorId = quizAuthorId(ownerId);
    return authorId
      ? this.dataSource.getRepository(Quiz).findOneBy({ id: quizId, authorId })
      : null;
  }

  async existsAndOwnedBy(quizId: string, ownerId: string): Promise<boolean> {
    const authorId = quizAuthorId(ownerId);
    return authorId
      ? this.dataSource.getRepository(Quiz).existsBy({ id: quizId, authorId })
      : false;
  }

  async findAllByOwner(ownerId: string): Promise<Quiz[]> {
    const authorId = quizAuthorId(ownerId);
    return authorId
      ? this.dataSource
          .getRepository(Quiz)
          .find({ where: { authorId }, order: { createdAt: 'ASC' } })
      : [];
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
    // Fetch before the transaction: no partial quiz is stored if PokéAPI is down.
    const facts = await this.pokeApi.getStarterFacts();
    const quiz = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(Quiz, {
        authorId: userId,
        title: 'Pokémon: Verdadero o Falso',
        description: 'Quiz generado con datos de PokéAPI. Las preguntas quedan guardadas para jugar sin conexión a PokéAPI.',
      });
      for (const [index, fact] of facts.entries()) {
        const correct = index % 2 === 0;
        const statedType = correct ? fact.primaryType : this.falseType(fact);
        const question = await manager.save(Question, {
          quizId: created.id,
          kind: QuestionKind.TRUE_FALSE,
          questionText: `¿${this.displayName(fact.name)} es de tipo ${TYPE_NAMES[statedType] ?? statedType}?`,
          timeLimitSeconds: 20,
          points: 1000,
        });
        await manager.save(QuestionOption, [
          { questionId: question.id, position: 0, text: 'Verdadero', isCorrect: correct },
          { questionId: question.id, position: 1, text: 'Falso', isCorrect: !correct },
        ]);
      }
      return created;
    });
    return serializeQuiz(quiz);
  }

  private falseType(fact: PokemonFact): string {
    return FALSE_TYPES.find((type) => type !== fact.primaryType) ?? 'normal';
  }

  private displayName(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
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
