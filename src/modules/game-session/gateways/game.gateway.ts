import { Injectable, Logger } from '@nestjs/common';
import { GameSessionService } from '../services/game-session.service';
import { JoinRoomDto } from '../dto/join-room.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';

/**
 * GameGateway
 * Nota: Al instalar @nestjs/websockets y @nestjs/platform-socket.io,
 * decora esta clase con @WebSocketGateway({ cors: true }) e implementa
 * OnGatewayConnection y OnGatewayDisconnect.
 */
@Injectable()
export class GameGateway {
  private readonly logger = new Logger(GameGateway.name);

  constructor(private readonly gameSessionService: GameSessionService) {}

  handleJoinRoom(client: any, payload: JoinRoomDto) {
    this.logger.log(`Client ${client.id} joined room ${payload.pin} as ${payload.playerName}`);
    return this.gameSessionService.joinRoom(payload);
  }

  handleSubmitAnswer(client: any, payload: SubmitAnswerDto) {
    this.logger.log(`Client ${client.id} submitted answer for PIN ${payload.pin}`);
    return this.gameSessionService.submitAnswer(payload);
  }
}
