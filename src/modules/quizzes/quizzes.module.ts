import { Module } from '@nestjs/common';
import { QuizzesController } from './controllers/quizzes.controller';
import { QuizzesService } from './services/quizzes.service';
import { QuestionsController } from './controllers/questions.controller';
import { QuestionsService } from './services/questions.service';
import { ImageStorage } from './services/image-storage.service';
import { QuestionImagesService } from './services/question-images.service';
import { QuestionOwnerGuard } from './controllers/question-owner.guard';
import { QuestionImageUploadInterceptor } from './controllers/question-image-upload.interceptor';
import { QuestionImagesController } from './controllers/question-images.controller';
import { FileCleanupWorker } from './services/file-cleanup.worker';

@Module({
  controllers: [
    QuizzesController,
    QuestionsController,
    QuestionImagesController,
  ],
  providers: [
    QuizzesService,
    QuestionsService,
    ImageStorage,
    QuestionImagesService,
    QuestionOwnerGuard,
    QuestionImageUploadInterceptor,
    FileCleanupWorker,
  ],
  exports: [QuizzesService],
})
export class QuizzesModule {}
