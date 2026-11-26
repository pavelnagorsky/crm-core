import { ApiProperty } from '@nestjs/swagger';
import {
  OrderItemPriceAdjustment,
  PriceAdjustmentKind,
  PriceValueType,
} from '@prisma/client';
import {
  ApiDecimal,
  ApiSignedAmount,
} from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { OrderPriceAdjustmentData } from '../interfaces/order-price-adjustment-data.interface.js';

/** A price layer of an order line (docs/pricing-stage7-api.md). */
export class OrderPriceAdjustmentDto {
  @ApiProperty({ enum: PriceAdjustmentKind, enumName: 'PriceAdjustmentKind' })
  kind: PriceAdjustmentKind;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  ruleId: string | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  publicTitle: string | null;

  @ApiProperty({
    enum: PriceValueType,
    enumName: 'PriceValueType',
    nullable: true,
  })
  valueType: PriceValueType | null;

  @ApiDecimal({
    nullable: true,
    description:
      'Rule value: percent, or amount (per piece for PIECE products, per line otherwise).',
  })
  value: string | null;

  @ApiSignedAmount({ description: 'Signed change of the line total.' })
  amount: string;

  static fromLayer(
    layer: OrderItemPriceAdjustment | OrderPriceAdjustmentData,
  ): OrderPriceAdjustmentDto {
    return Object.assign(new OrderPriceAdjustmentDto(), {
      kind: layer.kind,
      ruleId: layer.ruleId,
      title: layer.title,
      publicTitle: layer.publicTitle,
      valueType: layer.valueType,
      value: layer.value === null ? null : MoneyUtils.format(layer.value),
      amount: MoneyUtils.format(layer.amount),
    });
  }
}
