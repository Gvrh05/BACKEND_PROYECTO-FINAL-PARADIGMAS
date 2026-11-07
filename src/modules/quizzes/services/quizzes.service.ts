import { Injectable } from '@nestjs/common';
import { CreateQuizDto } from '../dto/create-quiz.dto';
import { AddQuestionDto } from '../dto/add-question.dto';

@Injectable()
export class QuizzesService {
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
}
