import { IsBoolean, IsString, Length } from 'class-validator';
import { TrimText } from './validation';

export class QuestionOptionDto {
  @TrimText()
  @IsString()
  @Length(1, 500)
  text: string;

  @IsBoolean()
  isCorrect: boolean;
}
