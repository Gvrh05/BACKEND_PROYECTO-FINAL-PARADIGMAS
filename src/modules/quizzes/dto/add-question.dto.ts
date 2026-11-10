import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
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

import { QuestionKind } from '../entities/question.entity';

export class AddQuestionDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(QuestionKind)
  kind?: QuestionKind;

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
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @Validate(ExactlyOneCorrect)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options: QuestionOptionDto[];
}
