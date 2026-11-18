import { IsIn, IsNotEmpty, IsUUID, ValidateIf } from 'class-validator';

import type { ScoringMode } from '../engine/live-game';

export class CreateGameSessionDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(['classic', 'speed', 'precision'])
  scoringMode?: ScoringMode;

  @IsUUID()
  @IsNotEmpty()
  quizId: string;
}
