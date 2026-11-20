import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { NotSpecifiedResult } from '../../orders/aggregates/interfaces/not-specified-result.interface.js';
import { FinanceNotSpecifiedItemDto } from './finance-not-specified-item.dto.js';

/**
 * Visits and sales of the period with something due and no active payment record: closed
 * visits (COMPLETED, NO_SHOW, CANCELLED, deleted) by their start, active sales by their date.
 */
export class FinanceNotSpecifiedDto {
  @ApiPrice({ description: 'Amount due of all of them.' })
  amount: string;

  @ApiProperty({ type: Number, description: 'All of them.' })
  count: number;

  @ApiProperty({
    type: () => FinanceNotSpecifiedItemDto,
    isArray: true,
    description: 'The first 20 by time.',
  })
  items: FinanceNotSpecifiedItemDto[];

  static fromResult(result: NotSpecifiedResult): FinanceNotSpecifiedDto {
    return Object.assign(new FinanceNotSpecifiedDto(), {
      amount: MoneyUtils.format(result.amount),
      count: result.count,
      items: result.items.map(FinanceNotSpecifiedItemDto.fromRow),
    });
  }
}
