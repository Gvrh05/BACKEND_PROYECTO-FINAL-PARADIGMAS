import {
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';
import { TrimText } from './validation';

export class CreateQuizDto {
  @TrimText()
  @IsString()
  @Length(1, 150)
  title: string;

  @IsOptional()
  @TrimText()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  coverImageUrl?: string | null;
}
