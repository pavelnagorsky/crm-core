import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { OrderItemType } from '../../orders/enums/order-item-type.enum.js';
import { OrderPricingLine } from '../../orders/interfaces/order-pricing-line.interface.js';
import { ProductUnit } from '../../products/enums/product-unit.enum.js';

export class BookingPricingItemResponseDto {
  @ApiProperty({ enum: OrderItemType, enumName: 'OrderItemType' })
  type: OrderItemType;

  @ApiProperty({ type: String, format: 'uuid' })
  catalogItemId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  sku: string | null;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit', nullable: true })
  unit: ProductUnit | null;

  @ApiProperty({ type: String, format: 'decimal' })
  quantity: string;

  @ApiPrice()
  listUnitPrice: string;

  @ApiPrice()
  listLineTotal: string;

  @ApiPrice({ nullable: true })
  customUnitPrice: string | null;

  @ApiPrice()
  unitPrice: string;

  @ApiPrice()
  lineSubtotal: string;

  @ApiPrice()
  discountTotal: string;

  @ApiPrice()
  lineTotal: string;

  static fromLine(line: OrderPricingLine): BookingPricingItemResponseDto {
    return Object.assign(new BookingPricingItemResponseDto(), line, {
      quantity: QuantityUtils.format(line.quantity),
      listUnitPrice: MoneyUtils.format(line.listUnitPrice),
      listLineTotal: MoneyUtils.format(line.listLineTotal),
      customUnitPrice:
        line.customUnitPrice == null
          ? null
          : MoneyUtils.format(line.customUnitPrice),
      unitPrice: MoneyUtils.format(line.unitPrice),
      lineSubtotal: MoneyUtils.format(line.lineSubtotal),
      discountTotal: MoneyUtils.format(line.discountTotal),
      lineTotal: MoneyUtils.format(line.lineTotal),
    });
  }
}
