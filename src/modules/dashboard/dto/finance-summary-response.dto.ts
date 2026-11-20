import { ApiProperty } from '@nestjs/swagger';
import { FinanceSummary } from '../interfaces/finance-summary.interface.js';
import { FinanceMoneyDto } from './finance-money.dto.js';
import { FinanceNotSpecifiedDto } from './finance-not-specified.dto.js';
import { FinanceRefundsDto } from './finance-refunds.dto.js';

export class FinanceSummaryResponseDto {
  @ApiProperty({ type: String, format: 'date' })
  from: string;

  @ApiProperty({ type: String, format: 'date' })
  to: string;

  @ApiProperty({ type: String, example: 'BYN' })
  currency: string;

  @ApiProperty({ type: String, example: 'Europe/Minsk' })
  timezone: string;

  @ApiProperty({
    type: () => FinanceMoneyDto,
    description:
      'Active payments minus active refunds whose money changed hands (occurredAt) in the period. Voided records are not counted.',
  })
  money: FinanceMoneyDto;

  @ApiProperty({ type: () => FinanceRefundsDto })
  refunds: FinanceRefundsDto;

  @ApiProperty({ type: () => FinanceNotSpecifiedDto })
  notSpecified: FinanceNotSpecifiedDto;

  static fromSummary(summary: FinanceSummary): FinanceSummaryResponseDto {
    return Object.assign(new FinanceSummaryResponseDto(), {
      from: summary.from,
      to: summary.to,
      currency: summary.currency,
      timezone: summary.timezone,
      money: FinanceMoneyDto.fromTotals(summary.money),
      refunds: FinanceRefundsDto.fromTotals(summary.money),
      notSpecified: FinanceNotSpecifiedDto.fromResult(summary.notSpecified),
    });
  }
}
