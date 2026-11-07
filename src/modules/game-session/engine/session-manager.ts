import { Injectable, Logger } from '@nestjs/common';
import { GamePhase, GameStateDto } from '../dto/game-state.dto';

export interface ActiveSession {
  pin: string;
  quizId: string;
  hostSocketId: string;
  phase: GamePhase;
  currentQuestionIndex: number;
  players: Map<string, { id: string; name: string; score: number; socketId: string }>;
  answers: Map<string, Map<string, string>>; // questionId -> (playerId -> optionId)
}

@Injectable()
export class SessionManager {
  private readonly logger = new Logger(SessionManager.name);
  private sessions = new Map<string, ActiveSession>();

  createSession(quizId: string, hostSocketId: string): ActiveSession {
    const pin = this.generatePin();
    const session: ActiveSession = {
      pin,
      quizId,
      hostSocketId,
      phase: GamePhase.LOBBY,
      currentQuestionIndex: 0,
      players: new Map(),
      answers: new Map(),
    };
    this.sessions.set(pin, session);
    this.logger.log(`Session created with PIN: ${pin}`);
    return session;
  }

  getSession(pin: string): ActiveSession | undefined {
    return this.sessions.get(pin);
  }

  removeSession(pin: string): boolean {
    return this.sessions.delete(pin);
  }

  private generatePin(): string {
    let pin: string;
    do {
      pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.sessions.has(pin));
    return pin;
  }
}
