import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleKind } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class PriceRuleSummaryRequestDto {
  @ApiProperty({
    enum: PriceRuleKind,
    enumName: 'PriceRuleKind',
    required: false,
    default: PriceRuleKind.PROMOTION,
    description: 'Only PROMOTION has a summary.',
  })
  @IsOptional()
  @IsEnum(PriceRuleKind)
  kind?: PriceRuleKind;
}
