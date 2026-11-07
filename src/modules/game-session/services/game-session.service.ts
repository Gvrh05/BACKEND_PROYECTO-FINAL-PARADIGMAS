import { Injectable, NotFoundException } from '@nestjs/common';
import { SessionManager } from '../engine/session-manager';
import { JoinRoomDto } from '../dto/join-room.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';

@Injectable()
export class GameSessionService {
  constructor(private readonly sessionManager: SessionManager) {}

  createSession(quizId: string, hostSocketId: string) {
    return this.sessionManager.createSession(quizId, hostSocketId);
  }

  joinRoom(dto: JoinRoomDto) {
    const session = this.sessionManager.getSession(dto.pin);
    if (!session) {
      throw new NotFoundException(`Session with PIN ${dto.pin} not found`);
    }
    const playerId = `player_${Date.now()}`;
    session.players.set(playerId, {
      id: playerId,
      name: dto.playerName,
      score: 0,
      socketId: '',
    });
    return { playerId, playerName: dto.playerName, pin: dto.pin };
  }

  submitAnswer(dto: SubmitAnswerDto) {
    const session = this.sessionManager.getSession(dto.pin);
    if (!session) {
      throw new NotFoundException(`Session with PIN ${dto.pin} not found`);
    }
    return { success: true, pin: dto.pin, playerId: dto.playerId };
  }
}
