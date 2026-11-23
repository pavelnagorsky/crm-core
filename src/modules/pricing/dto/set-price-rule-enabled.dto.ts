import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetPriceRuleEnabledDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  enabled: boolean;
}
