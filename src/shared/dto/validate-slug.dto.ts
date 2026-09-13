import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Matches, ValidateIf } from 'class-validator';
import regularExpressions from '../regular-expressions.js';

export class ValidateSlugDto {
  @ApiProperty({ type: String, description: 'Entity slug' })
  @Matches(regularExpressions.slugPattern)
  slug: string;

  @ApiProperty({ type: Number, description: 'Entity ID', required: false })
  @ValidateIf((object, value) => Boolean(value))
  @IsNumber()
  id?: number;
}
