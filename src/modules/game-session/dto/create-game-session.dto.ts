import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateGameSessionDto {
  @IsUUID()
  @IsNotEmpty()
  quizId: string;
}
