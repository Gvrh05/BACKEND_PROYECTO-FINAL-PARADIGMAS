import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { QuizzesService } from '../services/quizzes.service';
import { CreateQuizDto } from '../dto/create-quiz.dto';
import { AddQuestionDto } from '../dto/add-question.dto';
import { CurrentUser, AuthenticatedUser } from '../../../shared/decorators/current-user.decorator';

@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Post()
  create(
    @Body() createQuizDto: CreateQuizDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quizzesService.create({
      ...createQuizDto,
      authorId: user.userId,
    } as any);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.quizzesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quizzesService.findOne(id);
  }

  @Post(':id/questions')
  addQuestion(@Param('id') id: string, @Body() addQuestionDto: AddQuestionDto) {
    return this.quizzesService.addQuestion(id, addQuestionDto);
  }
}
