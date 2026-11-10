import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quiz as QuizEntity } from '../entities/quiz.entity';
import { CreateQuizDto } from '../dto/create-quiz.dto';
import { AddQuestionDto } from '../dto/add-question.dto';

@Injectable()
export class QuizzesService {
  constructor(
    @InjectRepository(QuizEntity)
    private readonly quizzes: Repository<QuizEntity>,
  ) {}

  async create(createQuizDto: CreateQuizDto) {
    return { message: 'Quiz created successfully', data: createQuizDto };
  }

  async findAll() {
    return [];
  }

  async findOne(id: string) {
    return { id, title: 'Sample Quiz' };
  }

  async addQuestion(quizId: string, addQuestionDto: AddQuestionDto) {
    return { quizId, question: addQuestionDto };
  }

  async findOneByOwner(quizId: string, ownerId: string): Promise<QuizEntity | null> {
    return this.quizzes.findOneBy({ id: quizId, ownerId });
  }

  async existsAndOwnedBy(quizId: string, ownerId: string): Promise<boolean> {
    return this.quizzes.existsBy({ id: quizId, ownerId });
  }

  async findAllByOwner(ownerId: string): Promise<QuizEntity[]> {
    return this.quizzes.find({ where: { ownerId }, order: { createdAt: 'ASC' } });
  }
}
