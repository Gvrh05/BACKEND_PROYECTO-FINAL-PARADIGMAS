import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { QuestionOptionDto } from './question-option.dto';
import { ExactlyOneCorrect, TrimText } from './validation';

export class AddQuestionDto {
  @TrimText()
  @IsString()
  @Length(1, 2000)
  questionText: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(300)
  timeLimitSeconds?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(100000)
  points?: number;

  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @Validate(ExactlyOneCorrect)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options: QuestionOptionDto[];
}
