import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleTargetType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class PriceRuleTargetInputDto {
  @ApiProperty({ enum: PriceRuleTargetType, enumName: 'PriceRuleTargetType' })
  @IsEnum(PriceRuleTargetType)
  type: PriceRuleTargetType;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    default: false,
    description:
      'true only for an exclusion of a rule that applies to all; such a rule lists nothing else.',
  })
  @IsOptional()
  @IsBoolean()
  excluded?: boolean;
}
