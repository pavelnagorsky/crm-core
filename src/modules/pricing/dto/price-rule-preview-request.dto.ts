import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { PriceRuleInputDto } from './price-rule-input.dto.js';

export class PriceRulePreviewRequestDto {
  @ApiProperty({
    type: () => PriceRuleInputDto,
    description: 'The rule as the form holds it; validated like a save.',
  })
  @ValidateNested()
  @Type(() => PriceRuleInputDto)
  rule: PriceRuleInputDto;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Rule being edited: the draft replaces it in the preview.',
  })
  @IsOptional()
  @IsUUID()
  ruleId?: string;
}
