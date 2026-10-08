import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
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
      quantity: QuantityService.format(line.quantity),
      listUnitPrice: MoneyService.format(line.listUnitPrice),
      listLineTotal: MoneyService.format(line.listLineTotal),
      customUnitPrice:
        line.customUnitPrice == null
          ? null
          : MoneyService.format(line.customUnitPrice),
      unitPrice: MoneyService.format(line.unitPrice),
      lineSubtotal: MoneyService.format(line.lineSubtotal),
      discountTotal: MoneyService.format(line.discountTotal),
      lineTotal: MoneyService.format(line.lineTotal),
    });
  }
}
