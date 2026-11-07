import { Module } from '@nestjs/common';
import { GameSessionService } from './services/game-session.service';
import { GameGateway } from './gateways/game.gateway';
import { SessionManager } from './engine/session-manager';

@Module({
  providers: [GameSessionService, GameGateway, SessionManager],
  exports: [GameSessionService, SessionManager],
})
export class GameSessionModule {}
