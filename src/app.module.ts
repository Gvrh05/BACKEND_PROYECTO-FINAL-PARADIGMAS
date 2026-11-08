import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './shared/database/database.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { GameSessionModule } from './modules/game-session/game-session.module';
import { ResultsModule } from './modules/results/results.module';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';

@Module({
  imports: [
    DatabaseModule,
    QuizzesModule,
    GameSessionModule,
    ResultsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
