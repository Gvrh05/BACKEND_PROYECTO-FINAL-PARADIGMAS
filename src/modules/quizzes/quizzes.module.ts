import { Module } from '@nestjs/common';
import { QuizzesController } from './controllers/quizzes.controller';
import { QuizzesService } from './services/quizzes.service';

@Module({
  controllers: [QuizzesController],
  providers: [QuizzesService],
  exports: [QuizzesService],
})
export class QuizzesModule {}
