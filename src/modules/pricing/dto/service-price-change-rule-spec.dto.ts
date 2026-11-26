import { ApiProperty } from '@nestjs/swagger';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';
import { ServicePriceChangeIncludeDto } from './service-price-change-include.dto.js';

/** The rule of a RULE change as it was sent. */
export class ServicePriceChangeRuleSpecDto {
  @ApiProperty({
    enum: PriceChangeMode,
    enumName: 'PriceChangeMode',
  })
  mode: PriceChangeMode;

  @ApiProperty({ type: String, nullable: true })
  value: string | null;

  @ApiProperty({ type: String })
  priceRoundingStep: string;

  @ApiProperty({ type: () => ServicePriceChangeIncludeDto })
  include: ServicePriceChangeIncludeDto;
}
