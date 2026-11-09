import {
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TrimText } from './validation';

export class UpdateQuizDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @TrimText()
  @IsString()
  @Length(1, 150)
  title?: string;

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
