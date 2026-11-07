import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './shared/database/database.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { GameSessionModule } from './modules/game-session/game-session.module';
import { ResultsModule } from './modules/results/results.module';

@Module({
  imports: [
    DatabaseModule,
    QuizzesModule,
    GameSessionModule,
    ResultsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
