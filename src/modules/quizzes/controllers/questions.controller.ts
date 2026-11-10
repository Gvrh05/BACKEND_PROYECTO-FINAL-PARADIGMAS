import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { AddQuestionDto } from '../dto/add-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';
import { AuthoringValidationPipe } from '../dto/authoring-validation.pipe';
import { QuestionsService } from '../services/questions.service';

@Controller('quizzes/:quizId/questions')
@UsePipes(AuthoringValidationPipe)
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Post()
  create(
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
    @Body() dto: AddQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.create(user.userId, quizId, dto);
  }

  @Get()
  findAll(
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.findAll(user.userId, quizId);
  }

  @Get(':questionId')
  findOne(
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
    @Param('questionId', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.findOne(user.userId, quizId, id);
  }

  @Patch(':questionId')
  update(
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
    @Param('questionId', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.update(user.userId, quizId, id, dto);
  }

  @Delete(':questionId')
  @HttpCode(204)
  remove(
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
    @Param('questionId', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.remove(user.userId, quizId, id);
  }
}
