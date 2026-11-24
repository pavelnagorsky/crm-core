import { ApiProperty } from '@nestjs/swagger';
import {
  PriceRuleKind,
  PriceScheduleType,
  PriceValueType,
  PromotionChannel,
  PromotionClientFilter,
  PromotionLimitPeriod,
  PromotionScenario,
} from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceRuleStats } from '../interfaces/price-rule-stats.interface.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleView } from '../interfaces/price-rule-view.interface.js';
import { maskToWeekdays } from '../rules/price-rule-input.rules.js';
import {
  buildPromotionConditions,
  promotionConditionsInput,
} from '../rules/promotion-conditions.rules.js';
import { PriceRuleStaffResponseDto } from './price-rule-staff-response.dto.js';
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

  // Promotion fields (docs/pricing-stage4-api.md); empty values for surcharges.

  @ApiProperty({
    enum: PromotionScenario,
    enumName: 'PromotionScenario',
    nullable: true,
  })
  scenario: PromotionScenario | null;

  @ApiProperty({ type: String, nullable: true })
  publicName: string | null;

  @ApiProperty({ type: String, nullable: true })
  publicDescription: string | null;

  @ApiProperty({ type: Boolean })
  showAsPromotion: boolean;

  @ApiProperty({ type: String, nullable: true, example: '2026-11-01' })
  bookingFrom: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-11-30' })
  bookingTo: string | null;

  @ApiProperty({ type: Number, nullable: true })
  minLeadMinutes: number | null;

  @ApiProperty({ type: Number, nullable: true })
  maxLeadMinutes: number | null;

  @ApiProperty({
    enum: PromotionChannel,
    enumName: 'PromotionChannel',
    isArray: true,
  })
  channels: PromotionChannel[];

  @ApiProperty({
    type: () => PriceRuleStaffResponseDto,
    isArray: true,
    description: 'Empty: every staff member.',
  })
  staff: PriceRuleStaffResponseDto[];

  @ApiProperty({
    enum: PromotionClientFilter,
    enumName: 'PromotionClientFilter',
  })
  clientFilter: PromotionClientFilter;

  @ApiProperty({ type: Number, nullable: true })
  birthdayWindowDays: number | null;

  @ApiProperty({ type: String, nullable: true })
  promoCode: string | null;

  @ApiProperty({ type: Number, nullable: true })
  usageLimitTotal: number | null;

  @ApiProperty({ type: Number, nullable: true })
  usageLimitPerClient: number | null;

  @ApiProperty({
    enum: PromotionLimitPeriod,
    enumName: 'PromotionLimitPeriod',
    nullable: true,
  })
  usageLimitPeriod: PromotionLimitPeriod | null;

  @ApiPrice({ nullable: true })
  minVisitTotal: string | null;

  @ApiProperty({
    type: Number,
    description: 'Live bookings with the promotion, all time ("34 of 100"); 0 for surcharges.',
  })
  usageCount: number;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Promotion conditions as clients read them; empty for surcharges.',
  })
  conditions: string[];

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromView(
    view: PriceRuleView,
    stats: PriceRuleStats | undefined,
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
    dto.stats30d = PriceRuleStatsResponseDto.fromStats(rule.kind, stats);
    dto.scenario = rule.scenario;
    dto.publicName = rule.publicName;
    dto.publicDescription = rule.publicDescription;
    dto.showAsPromotion = rule.showAsPromotion;
    dto.bookingFrom = day(rule.bookingFrom);
    dto.bookingTo = day(rule.bookingTo);
    dto.minLeadMinutes = rule.minLeadMinutes;
    dto.maxLeadMinutes = rule.maxLeadMinutes;
    dto.channels = rule.channels ?? [];
    dto.staff = view.staff.map(PriceRuleStaffResponseDto.fromView);
    dto.clientFilter = rule.clientFilter;
    dto.birthdayWindowDays = rule.birthdayWindowDays;
    dto.promoCode = rule.promoCode;
    dto.usageLimitTotal = rule.usageLimitTotal;
    dto.usageLimitPerClient = rule.usageLimitPerClient;
    dto.usageLimitPeriod = rule.usageLimitPeriod;
    dto.minVisitTotal =
      rule.minVisitTotal === null ? null : MoneyUtils.format(rule.minVisitTotal);
    const promotion = rule.kind === PriceRuleKind.PROMOTION;
    dto.usageCount = promotion ? (stats?.usageCount ?? 0) : 0;
    dto.conditions = promotion
      ? buildPromotionConditions(
          promotionConditionsInput(rule, {
            targets: view.targets,
            staffNames: view.staff.flatMap((item) =>
              item.name === null ? [] : [item.name],
            ),
            currency: view.currency,
            usageCount: dto.usageCount,
          }),
        )
      : [];
    dto.createdAt = rule.createdAt;
    dto.updatedAt = rule.updatedAt;
    return dto;
  }
}
