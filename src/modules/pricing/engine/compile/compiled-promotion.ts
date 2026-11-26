import { PriceRuleSkipReason } from '../enums/price-rule-skip-reason.enum.js';
import { PromotionChannel } from '../enums/promotion-channel.enum.js';
import { PromotionClientFilter } from '../enums/promotion-client-filter.enum.js';
import { PricingPromotionEntry } from '../interfaces/pricing-promotion-entry.interface.js';
import { PromotionCheck } from '../interfaces/promotion-check.interface.js';
import { CalendarDayParser } from './calendar-day.parser.js';
import { CalendarDay } from './interfaces/calendar-day.interface.js';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * Own conditions of a promotion (docs/pricing-stage4-api.md), on top of the schedule and
 * targets of its CompiledRule. Checked in the order of PriceRuleSkipReason.
 */
export class CompiledPromotion {
  readonly publicName: string;
  readonly showAsPromotion: boolean;
  /** Upper case. */
  readonly promoCode: string | null;

  private readonly channels: ReadonlySet<PromotionChannel>;
  /** Null: every staff member. */
  private readonly staffIds: ReadonlySet<string> | null;
  private readonly bookingFrom: number | null;
  private readonly bookingTo: number | null;
  private readonly minLeadMs: number | null;
  private readonly maxLeadMs: number | null;
  private readonly clientFilter: PromotionClientFilter;
  private readonly birthdayWindowDays: number;
  private readonly usageLimitTotal: number | null;
  private readonly usageLimitPerClient: number | null;
  /** Minor units; null: no minimum. */
  readonly minVisitTotal: number | null;

  constructor(
    private readonly ruleId: string,
    entry: PricingPromotionEntry,
  ) {
    this.publicName = entry.publicName;
    this.showAsPromotion = entry.showAsPromotion;
    this.promoCode = entry.promoCode?.toUpperCase() ?? null;
    this.channels = new Set(entry.channels);
    this.staffIds = entry.staffIds.length > 0 ? new Set(entry.staffIds) : null;
    this.bookingFrom =
      entry.bookingFrom === null
        ? null
        : CalendarDayParser.parse(entry.bookingFrom).ymd;
    this.bookingTo =
      entry.bookingTo === null
        ? null
        : CalendarDayParser.parse(entry.bookingTo).ymd;
    this.minLeadMs =
      entry.minLeadMinutes === null
        ? null
        : entry.minLeadMinutes * MS_PER_MINUTE;
    this.maxLeadMs =
      entry.maxLeadMinutes === null
        ? null
        : entry.maxLeadMinutes * MS_PER_MINUTE;
    this.clientFilter = entry.clientFilter;
    this.birthdayWindowDays = entry.birthdayWindowDays ?? 0;
    this.usageLimitTotal = entry.usageLimitTotal;
    this.usageLimitPerClient = entry.usageLimitPerClient;
    this.minVisitTotal = entry.minVisitTotal;
  }

  get hasLimits(): boolean {
    return this.usageLimitTotal !== null || this.usageLimitPerClient !== null;
  }

  /** First own condition that does not hold, or null. */
  conditionReason(check: PromotionCheck): PriceRuleSkipReason | null {
    const { context } = check;
    if (!this.channels.has(context.channel))
      return PriceRuleSkipReason.WRONG_CHANNEL;
    if (
      this.staffIds !== null &&
      check.staffIds.some(
        (staffId) => staffId === null || !this.staffIds?.has(staffId),
      )
    )
      return PriceRuleSkipReason.WRONG_STAFF;
    if (!this.inBookingPeriod(context.today))
      return PriceRuleSkipReason.OUT_OF_BOOKING_PERIOD;
    if (check.noVisit && (this.minLeadMs !== null || this.maxLeadMs !== null))
      return PriceRuleSkipReason.NO_VISIT;
    const lead =
      context.visitStartMs === null || context.catalogFloor === true
        ? null
        : context.visitStartMs - context.nowMs;
    if (this.minLeadMs !== null && (lead === null || lead < this.minLeadMs))
      return PriceRuleSkipReason.LEAD_TIME_TOO_SHORT;
    if (this.maxLeadMs !== null && (lead === null || lead > this.maxLeadMs))
      return PriceRuleSkipReason.LEAD_TIME_TOO_LONG;
    const clientReason = this.clientReason(check);
    if (clientReason !== null) return clientReason;
    if (
      this.promoCode !== null &&
      context.promoCode?.trim().toUpperCase() !== this.promoCode
    )
      return PriceRuleSkipReason.PROMO_CODE_REQUIRED;
    if (
      this.minVisitTotal !== null &&
      (context.catalogFloor === true ||
        check.visitListTotal < this.minVisitTotal)
    )
      return PriceRuleSkipReason.BELOW_MIN_TOTAL;
    const usage = context.usage[this.ruleId];
    if (
      this.usageLimitTotal !== null &&
      (usage?.total ?? 0) >= this.usageLimitTotal
    )
      return PriceRuleSkipReason.LIMIT_REACHED;
    if (
      this.usageLimitPerClient !== null &&
      (usage?.perClient ?? 0) >= this.usageLimitPerClient
    )
      return PriceRuleSkipReason.CLIENT_LIMIT_REACHED;
    return null;
  }

  private clientReason(check: PromotionCheck): PriceRuleSkipReason | null {
    if (this.clientFilter === PromotionClientFilter.ANY) return null;
    const { client } = check.context;
    if (!client.known) return PriceRuleSkipReason.CLIENT_UNKNOWN;
    if (this.clientFilter === PromotionClientFilter.NEW)
      return client.isNew ? null : PriceRuleSkipReason.NOT_NEW_CLIENT;
    if (client.birthday === null) return PriceRuleSkipReason.NO_BIRTH_DATE;
    return CompiledPromotion.daysFromBirthday(check.day, client.birthday) <=
      this.birthdayWindowDays
      ? null
      : PriceRuleSkipReason.NOT_BIRTHDAY;
  }

  private inBookingPeriod(today: string): boolean {
    if (this.bookingFrom === null && this.bookingTo === null) return true;
    const key = CalendarDayParser.parse(today).ymd;
    return (
      (this.bookingFrom === null || key >= this.bookingFrom) &&
      (this.bookingTo === null || key <= this.bookingTo)
    );
  }

  /**
   * Days between a visit date and the nearest birthday (previous, this or next year), so
   * the window crosses the new year. 29 February is 28 February in a common year.
   */
  static daysFromBirthday(day: CalendarDay, birthday: string): number {
    const month = Number(birthday.slice(0, 2));
    const date = Number(birthday.slice(3, 5));
    if (
      birthday.length !== 5 ||
      birthday[2] !== '-' ||
      !(month >= 1 && month <= 12) ||
      !(date >= 1 && date <= 31)
    )
      throw new RangeError(`Invalid birthday ${birthday}`);
    const year = Math.floor(day.ymd / 10000);
    const visit = Date.UTC(year, Math.floor(day.md / 100) - 1, day.md % 100);
    let nearest = Number.POSITIVE_INFINITY;
    for (const candidateYear of [year - 1, year, year + 1]) {
      const leap =
        (candidateYear % 4 === 0 && candidateYear % 100 !== 0) ||
        candidateYear % 400 === 0;
      const candidateDate = month === 2 && date === 29 && !leap ? 28 : date;
      const time = Date.UTC(candidateYear, month - 1, candidateDate);
      nearest = Math.min(
        nearest,
        Math.round(Math.abs(visit - time) / MS_PER_DAY),
      );
    }
    return nearest;
  }
}
