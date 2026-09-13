import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import regularExpressions from '../regular-expressions.js';

export class UpdateSlugDto {
  @ApiProperty({ type: String, description: 'Entity slug' })
  @Matches(regularExpressions.slugPattern)
  slug: string;
}
