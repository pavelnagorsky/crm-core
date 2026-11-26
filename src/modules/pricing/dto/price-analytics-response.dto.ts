import { ApiProperty } from '@nestjs/swagger';
import { WidgetPeriodDto } from '../../dashboard/dto/widget-period.dto.js';
import { PriceAnalyticsPeriod } from '../interfaces/price-analytics-period.interface.js';
import { PriceAnalyticsSummary } from '../interfaces/price-analytics-summary.interface.js';
import { PriceAnalyticsCountsDto } from './price-analytics-counts.dto.js';
import { PriceAnalyticsReasonRowDto } from './price-analytics-reason-row.dto.js';
import { PriceAnalyticsStaffRowDto } from './price-analytics-staff-row.dto.js';
import { PriceAnalyticsTotalsDto } from './price-analytics-totals.dto.js';

/**
 * The "Скидки и наценки" block of the location analytics (docs/pricing-stage8-api.md,
 * «Сводка»): services of CONFIRMED and COMPLETED visits started in the period up to now, and
 * product lines confirmed in the period, net of returns.
 */
export class PriceAnalyticsResponseDto {
  @ApiProperty({ type: () => WidgetPeriodDto })
  period: WidgetPeriodDto;

  @ApiProperty({
    type: () => WidgetPeriodDto,
    nullable: true,
    description: 'null when compareWithPrevious = false.',
  })
  previousPeriod: WidgetPeriodDto | null;

  @ApiProperty({ type: String, example: 'BYN' })
  currency: string;

  @ApiProperty({ type: () => PriceAnalyticsTotalsDto })
  totals: PriceAnalyticsTotalsDto;

  @ApiProperty({
    type: () => PriceAnalyticsTotalsDto,
    nullable: true,
    description: 'The previous period; null without the comparison.',
  })
  previousTotals: PriceAnalyticsTotalsDto | null;

  @ApiProperty({
    type: () => PriceAnalyticsReasonRowDto,
    isArray: true,
    description:
      'PROMOTION (a row per rule), CLIENT_DISCOUNT, CUSTOM_PRICE_DOWN; amount desc, then name. No zero rows.',
  })
  discounts: PriceAnalyticsReasonRowDto[];

  @ApiProperty({
    type: () => PriceAnalyticsReasonRowDto,
    isArray: true,
    description: 'SURCHARGE (a row per rule), CUSTOM_PRICE_UP; amount desc, then name. No zero rows.',
  })
  surcharges: PriceAnalyticsReasonRowDto[];

  @ApiProperty({
    type: () => PriceAnalyticsStaffRowDto,
    isArray: true,
    description: 'received desc. No zero rows.',
  })
  staff: PriceAnalyticsStaffRowDto[];

  @ApiProperty({
    type: () => PriceAnalyticsCountsDto,
    description:
      'Distinct counts over all items of the period with any discount reason (the total row of the discounts tab).',
  })
  discountsCounts: PriceAnalyticsCountsDto;

  @ApiProperty({
    type: () => PriceAnalyticsCountsDto,
    description:
      'Distinct counts over all items of the period with any surcharge reason (the total row of the surcharges tab).',
  })
  surchargesCounts: PriceAnalyticsCountsDto;

  static fromSummary(summary: PriceAnalyticsSummary): PriceAnalyticsResponseDto {
    const dto = new PriceAnalyticsResponseDto();
    dto.period = period(summary.period);
    dto.previousPeriod = summary.previousPeriod
      ? period(summary.previousPeriod)
      : null;
    dto.currency = summary.currency;
    dto.totals = PriceAnalyticsTotalsDto.fromTotals(summary.totals);
    dto.previousTotals = summary.previousTotals
      ? PriceAnalyticsTotalsDto.fromTotals(summary.previousTotals)
      : null;
    dto.discounts = summary.discounts.map(PriceAnalyticsReasonRowDto.fromRow);
    dto.surcharges = summary.surcharges.map(PriceAnalyticsReasonRowDto.fromRow);
    dto.staff = summary.staff.map(PriceAnalyticsStaffRowDto.fromRow);
    dto.discountsCounts = PriceAnalyticsCountsDto.fromCounts(
      summary.discountsCounts,
    );
    dto.surchargesCounts = PriceAnalyticsCountsDto.fromCounts(
      summary.surchargesCounts,
    );
    return dto;
  }
}

function period(value: PriceAnalyticsPeriod): WidgetPeriodDto {
  return { from: value.from.toISOString(), to: value.to.toISOString() };
}
