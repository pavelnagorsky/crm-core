import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { PriceExplainLine } from '../interfaces/price-explain-line.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';
import { PriceExplainAdjustmentDto } from './price-explain-adjustment.dto.js';

export class PriceExplainLineDto {
  @ApiPrice()
  basePrice: string;

  @ApiPrice({
    description: 'Personal price, else the level price, else the base price.',
  })
  staffPrice: string;

  @ApiProperty({ type: () => PriceExplainAdjustmentDto, isArray: true })
  adjustments: PriceExplainAdjustmentDto[];

  @ApiPrice({ description: 'After surcharges and rounding.' })
  listPrice: string;

  @ApiProperty({
    type: () => PriceExplainAdjustmentDto,
    nullable: true,
    description:
      'The promotion or client discount (also the last item of adjustments); null without one.',
  })
  discount: PriceExplainAdjustmentDto | null;

  @ApiPrice({ description: 'listPrice minus the discount.' })
  chargedPrice: string;

  @ApiPrice()
  total: string;

  static fromLine(line: PriceExplainLine): PriceExplainLineDto {
    const dto = new PriceExplainLineDto();
    dto.basePrice = minorToApi(line.basePrice);
    dto.staffPrice = minorToApi(line.staffPrice);
    dto.adjustments = line.adjustments.map(
      PriceExplainAdjustmentDto.fromAdjustment,
    );
    dto.listPrice = minorToApi(line.listPrice);
    dto.discount =
      line.discount === null
        ? null
        : PriceExplainAdjustmentDto.fromAdjustment(line.discount);
    dto.chargedPrice = minorToApi(line.chargedPrice);
    dto.total = minorToApi(line.total);
    return dto;
  }
}
