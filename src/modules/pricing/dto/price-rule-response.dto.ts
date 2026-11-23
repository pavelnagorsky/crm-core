import { ApiProperty } from '@nestjs/swagger';
import {
  PriceRuleKind,
  PriceScheduleType,
  PriceValueType,
} from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceRuleSurchargeStats } from '../interfaces/price-rule-surcharge-stats.interface.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleView } from '../interfaces/price-rule-view.interface.js';
import { maskToWeekdays } from '../rules/price-rule-input.rules.js';
import { PriceRuleIntervalResponseDto } from './price-rule-interval-response.dto.js';
import { PriceRuleStatsResponseDto } from './price-rule-stats-response.dto.js';
import { PriceRuleTargetResponseDto } from './price-rule-target-response.dto.js';

const day = (date: Date | null): string | null =>
  date ? TimeUtils.dateOnlyStr(date) : null;

export class PriceRuleResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ enum: PriceRuleKind, enumName: 'PriceRuleKind' })
  kind: PriceRuleKind;

  @ApiProperty({ enum: PriceScheduleType, enumName: 'PriceScheduleType' })
  scheduleType: PriceScheduleType;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ type: Boolean })
  enabled: boolean;

  @ApiProperty({ type: Boolean })
  archived: boolean;

  @ApiProperty({ enum: PriceValueType, enumName: 'PriceValueType' })
  valueType: PriceValueType;

  @ApiPrice({
    description: 'Percent or amount by valueType, 2 fractional digits.',
  })
  value: string;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-01' })
  visitFrom: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-31' })
  visitTo: string | null;

  @ApiProperty({ type: Boolean })
  yearly: boolean;

  @ApiProperty({ type: Boolean })
  holidayExclusive: boolean;

  @ApiProperty({
    type: Number,
    isArray: true,
    description: 'ISO weekdays 1-7; empty: every day.',
  })
  weekdays: number[];

  @ApiProperty({ type: () => PriceRuleIntervalResponseDto, isArray: true })
  intervals: PriceRuleIntervalResponseDto[];

  @ApiProperty({ type: String, isArray: true, example: ['2026-12-31'] })
  dates: string[];

  @ApiProperty({ type: Boolean })
  appliesToAll: boolean;

  @ApiProperty({ type: () => PriceRuleTargetResponseDto, isArray: true })
  targets: PriceRuleTargetResponseDto[];

  @ApiProperty({
    type: Number,
    description: 'Distinct services the rule can touch.',
  })
  serviceCount: number;

  @ApiProperty({ enum: PriceRuleStatus, enumName: 'PriceRuleStatus' })
  status: PriceRuleStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-12-05',
    description: 'Nearest date the rule works, from today of the location.',
  })
  nextDate: string | null;

  @ApiProperty({ type: () => PriceRuleStatsResponseDto })
  stats30d: PriceRuleStatsResponseDto;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromView(
    view: PriceRuleView,
    stats: PriceRuleSurchargeStats | undefined,
  ): PriceRuleResponseDto {
    const { rule } = view;
    const dto = new PriceRuleResponseDto();
    dto.id = rule.id;
    dto.kind = rule.kind;
    dto.scheduleType = rule.scheduleType;
    dto.name = rule.name;
    dto.note = rule.note;
    dto.enabled = rule.enabled;
    dto.archived = rule.archivedAt !== null;
    dto.valueType = rule.valueType;
    dto.value = MoneyUtils.format(rule.value);
    dto.visitFrom = day(rule.visitFrom);
    dto.visitTo = day(rule.visitTo);
    dto.yearly = rule.yearly;
    dto.holidayExclusive = rule.holidayExclusive;
    dto.weekdays = maskToWeekdays(rule.weekdaysMask);
    dto.intervals = rule.intervals.map(
      PriceRuleIntervalResponseDto.fromMinutes,
    );
    dto.dates = rule.dates.map((item) => TimeUtils.dateOnlyStr(item.date));
    dto.appliesToAll = rule.appliesToAll;
    dto.targets = view.targets.map(PriceRuleTargetResponseDto.fromView);
    dto.serviceCount = view.serviceCount;
    dto.status = view.status;
    dto.nextDate = view.nextDate;
    dto.stats30d = PriceRuleStatsResponseDto.fromStats(stats);
    dto.createdAt = rule.createdAt;
    dto.updatedAt = rule.updatedAt;
    return dto;
  }
}
