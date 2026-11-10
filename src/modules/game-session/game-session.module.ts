import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSessionEntity } from './entities/game-session.entity';
import { QuizzesModule } from '../quizzes/quizzes.module';
import { AuthModule } from '../../shared/auth/auth.module';
import { GameSessionService } from './services/game-session.service';
import { GameGateway } from './gateways/game.gateway';
import { SessionManager } from './engine/session-manager';
import { GameSessionController } from './controllers/game-session.controller';
import { GameSessionEvents } from './gateways/game-session.events';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameSessionEntity]),
    QuizzesModule,
    AuthModule,
  ],
  providers: [
    GameSessionService,
    GameGateway,
    SessionManager,
    GameSessionEvents,
  ],
  controllers: [GameSessionController],
  exports: [GameSessionService, SessionManager],
})
export class GameSessionModule {}
