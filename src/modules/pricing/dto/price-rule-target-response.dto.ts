import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleTargetType } from '@prisma/client';
import { PriceRuleTargetView } from '../interfaces/price-rule-target-view.interface.js';

export class PriceRuleTargetResponseDto {
  @ApiProperty({ enum: PriceRuleTargetType, enumName: 'PriceRuleTargetType' })
  type: PriceRuleTargetType;

  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Current title; null when the target no longer exists.',
  })
  name: string | null;

  @ApiProperty({ type: Boolean })
  excluded: boolean;

  static fromView(target: PriceRuleTargetView): PriceRuleTargetResponseDto {
    const dto = new PriceRuleTargetResponseDto();
    dto.type = target.type;
    dto.id = target.id;
    dto.name = target.name;
    dto.excluded = target.excluded;
    return dto;
  }
}
