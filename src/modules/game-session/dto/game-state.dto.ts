export enum GamePhase {
  LOBBY = 'LOBBY',
  IN_PROGRESS = 'IN_PROGRESS',
  QUESTION_START = 'QUESTION_START',
  QUESTION_ACTIVE = 'QUESTION_ACTIVE',
  QUESTION_END = 'QUESTION_END',
  LEADERBOARD = 'LEADERBOARD',
  GAME_OVER = 'GAME_OVER',
}

export class GameStateDto {
  pin: string;
  quizId: string;
  phase: GamePhase;
  currentQuestionIndex: number;
  totalQuestions: number;
  activePlayersCount: number;
}
