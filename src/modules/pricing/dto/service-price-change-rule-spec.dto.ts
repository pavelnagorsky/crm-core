import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceChangeMode } from '../enums/service-price-change-mode.enum.js';
import { ServicePriceChangeIncludeDto } from './service-price-change-include.dto.js';

/** The rule of a RULE change as it was sent. */
export class ServicePriceChangeRuleSpecDto {
  @ApiProperty({
    enum: ServicePriceChangeMode,
    enumName: 'ServicePriceChangeMode',
  })
  mode: ServicePriceChangeMode;

  @ApiProperty({ type: String, nullable: true })
  value: string | null;

  @ApiProperty({ type: String })
  priceRoundingStep: string;

  @ApiProperty({ type: () => ServicePriceChangeIncludeDto })
  include: ServicePriceChangeIncludeDto;
}
