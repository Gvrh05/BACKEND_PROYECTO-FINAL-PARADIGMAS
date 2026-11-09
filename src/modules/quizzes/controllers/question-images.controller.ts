import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { QuestionOwnerGuard } from './question-owner.guard';
import { QuestionImageUploadInterceptor } from './question-image-upload.interceptor';
import { QuestionImagesService } from '../services/question-images.service';
import type { ValidatedQuestionImage } from '../services/image-storage.service';

@Controller('quizzes/:quizId/questions/:questionId/image')
@UseGuards(QuestionOwnerGuard)
export class QuestionImagesController {
  constructor(private readonly images: QuestionImagesService) {}

  @Put()
  @UseInterceptors(QuestionImageUploadInterceptor)
  store(
    @Param('quizId') quizId: string,
    @Param('questionId') questionId: string,
    @UploadedFile() file: ValidatedQuestionImage,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.images.store(user.userId, quizId, questionId, file);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  read(
    @Param('quizId') quizId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.images.read(user.userId, quizId, questionId);
  }

  @Delete()
  @HttpCode(204)
  remove(
    @Param('quizId') quizId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.images.remove(user.userId, quizId, questionId);
  }
}
