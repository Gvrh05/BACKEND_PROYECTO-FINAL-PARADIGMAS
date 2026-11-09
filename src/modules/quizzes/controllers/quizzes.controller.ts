import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  HttpCode,
  Body,
  Param,
  ParseUUIDPipe,
  UsePipes,
} from '@nestjs/common';
import { QuizzesService } from '../services/quizzes.service';
import { CreateQuizDto } from '../dto/create-quiz.dto';
import { AuthoringValidationPipe } from '../dto/authoring-validation.pipe';
import { UpdateQuizDto } from '../dto/update-quiz.dto';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';

@Controller('quizzes')
@UsePipes(AuthoringValidationPipe)
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Post()
  create(
    @Body() createQuizDto: CreateQuizDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quizzesService.create(user.userId, createQuizDto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.quizzesService.findAll(user.userId);
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quizzesService.findOne(user.userId, id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateQuizDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quizzesService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quizzesService.remove(user.userId, id);
  }
}
