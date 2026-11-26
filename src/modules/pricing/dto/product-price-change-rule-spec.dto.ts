import { ApiProperty } from '@nestjs/swagger';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';

/** The rule of a RULE product change as it was sent. */
export class ProductPriceChangeRuleSpecDto {
  @ApiProperty({ enum: PriceChangeMode, enumName: 'PriceChangeMode' })
  mode: PriceChangeMode;

  @ApiProperty({ type: String, nullable: true })
  value: string | null;

  @ApiProperty({ type: String })
  priceRoundingStep: string;
}
