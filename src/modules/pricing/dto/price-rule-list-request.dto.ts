import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PriceRuleKind } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class PriceRuleListRequestDto {
  @ApiProperty({
    type: Boolean,
    required: false,
    default: false,
    description: 'true: the archived rules; false: the others.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' : value,
  )
  @IsBoolean()
  archived?: boolean;

  @ApiProperty({
    enum: PriceRuleKind,
    enumName: 'PriceRuleKind',
    required: false,
    default: PriceRuleKind.SURCHARGE,
  })
  @IsOptional()
  @IsEnum(PriceRuleKind)
  kind?: PriceRuleKind;
}
