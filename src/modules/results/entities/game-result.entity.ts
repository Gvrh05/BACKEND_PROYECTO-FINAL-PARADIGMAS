import { PlayerScore } from './player-score.entity';

export class GameResult {
  id: string;
  pin: string;
  quizId: string;
  totalPlayers: number;
  scores: PlayerScore[];
  createdAt: Date;
}
