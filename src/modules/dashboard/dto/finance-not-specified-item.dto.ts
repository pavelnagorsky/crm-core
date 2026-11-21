import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingStatus } from '../../bookings/enums/booking-status.enum.js';
import { NotSpecifiedRow } from '../../orders/aggregates/interfaces/not-specified-row.interface.js';
import { FinanceNotSpecifiedKind } from '../enums/finance-not-specified-kind.enum.js';

export class FinanceNotSpecifiedItemDto {
  @ApiProperty({
    enum: FinanceNotSpecifiedKind,
    enumName: 'FinanceNotSpecifiedKind',
  })
  kind: FinanceNotSpecifiedKind;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null only for an old visit without an order.',
  })
  orderId: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The visit; null for a sale.',
  })
  bookingId: string | null;

  @ApiProperty({
    enum: BookingStatus,
    enumName: 'BookingStatus',
    nullable: true,
    description:
      'Status of the visit (COMPLETED, NO_SHOW, CANCELLED; any status for a deleted booking); null for a sale.',
  })
  bookingStatus: BookingStatus | null;

  @ApiProperty({ type: Date, description: 'Visit start or sale date.' })
  at: Date;

  @ApiProperty({ type: String, nullable: true })
  clientName: string | null;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Masters of a visit, sellers of a sale.',
  })
  staffNames: string[];

  @ApiPrice()
  amountDue: string;

  @ApiProperty({
    type: Number,
    minimum: 0,
    description:
      'Draft (not yet sold) PRODUCT lines of the order of the visit or sale; 0 without an order.',
  })
  draftProductsCount: number;

  static fromRow(row: NotSpecifiedRow): FinanceNotSpecifiedItemDto {
    return Object.assign(new FinanceNotSpecifiedItemDto(), {
      kind: row.kind,
      orderId: row.orderId,
      bookingId: row.bookingId,
      bookingStatus: row.bookingStatus,
      at: row.at,
      clientName: row.clientName,
      staffNames: row.staffNames,
      amountDue: MoneyUtils.format(row.amountDue),
      draftProductsCount: row.draftProductsCount,
    });
  }
}
