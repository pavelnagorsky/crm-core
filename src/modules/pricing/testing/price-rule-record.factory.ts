import {
  PriceRuleKind,
  PromotionChannel,
  PromotionClientFilter,
  PriceRuleTargetType,
  PriceScheduleType,
  PriceValueType,
  Prisma,
} from '@prisma/client';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

interface PriceRuleRecordOptions {
  id?: string;
  name?: string;
  scheduleType?: PriceScheduleType;
  enabled?: boolean;
  archivedAt?: Date | null;
  valueType?: PriceValueType;
  value?: string;
  visitFrom?: string | null;
  visitTo?: string | null;
  yearly?: boolean;
  holidayExclusive?: boolean;
  weekdaysMask?: number;
  appliesToAllServices?: boolean;
  appliesToAllProducts?: boolean;
  intervals?: [number, number][];
  dates?: string[];
  targets?: [PriceRuleTargetType, string, boolean?][];
  createdAt?: Date;
  kind?: PriceRuleKind;
  /** Promotion columns (and staffIds); a promotion gets a public name and both channels. */
  promotion?: Partial<PriceRulePromotionColumns> & { staffIds?: string[] };
}

type PriceRulePromotionColumns = Pick<
  PriceRuleRecord,
  | 'scenario'
  | 'publicName'
  | 'publicDescription'
  | 'showAsPromotion'
  | 'bookingFrom'
  | 'bookingTo'
  | 'minLeadMinutes'
  | 'maxLeadMinutes'
  | 'channels'
  | 'clientFilter'
  | 'birthdayWindowDays'
  | 'promoCode'
  | 'usageLimitTotal'
  | 'usageLimitPerClient'
  | 'usageLimitPeriod'
  | 'minVisitTotal'
>;

/** A stored rule: by default a weekly +20% on every service, enabled, every day. */
export function priceRuleRecord(
  options: PriceRuleRecordOptions = {},
): PriceRuleRecord {
  const id = options.id ?? 'rule-1';
  const kind = options.kind ?? PriceRuleKind.SURCHARGE;
  const promotion = kind === PriceRuleKind.PROMOTION;
  const { staffIds = [], ...columns } = options.promotion ?? {};
  return {
    id,
    locationId: 'location',
    kind,
    scheduleType: options.scheduleType ?? PriceScheduleType.WEEKLY,
    name: options.name ?? 'Evening',
    note: null,
    enabled: options.enabled ?? true,
    archivedAt: options.archivedAt ?? null,
    valueType: options.valueType ?? PriceValueType.PERCENT,
    value: new Prisma.Decimal(options.value ?? '20.00'),
    visitFrom: options.visitFrom ? day(options.visitFrom) : null,
    visitTo: options.visitTo ? day(options.visitTo) : null,
    yearly: options.yearly ?? false,
    holidayExclusive: options.holidayExclusive ?? false,
    weekdaysMask: options.weekdaysMask ?? 0,
    appliesToAllServices: options.appliesToAllServices ?? true,
    appliesToAllProducts: options.appliesToAllProducts ?? false,
    scenario: null,
    publicName: promotion ? (options.name ?? 'Evening') : null,
    publicDescription: null,
    showAsPromotion: true,
    bookingFrom: null,
    bookingTo: null,
    minLeadMinutes: null,
    maxLeadMinutes: null,
    channels: promotion ? [PromotionChannel.ONLINE, PromotionChannel.ADMIN] : [],
    clientFilter: PromotionClientFilter.ANY,
    birthdayWindowDays: null,
    promoCode: null,
    usageLimitTotal: null,
    usageLimitPerClient: null,
    usageLimitPeriod: null,
    minVisitTotal: null,
    ...columns,
    createdById: null,
    createdAt: options.createdAt ?? new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    targets: (options.targets ?? []).map(
      ([targetType, targetId, excluded]) => ({
        ruleId: id,
        targetType,
        targetId,
        excluded: excluded ?? false,
      }),
    ),
    intervals: (options.intervals ?? []).map(([startMinute, endMinute]) => ({
      ruleId: id,
      startMinute,
      endMinute,
    })),
    dates: (options.dates ?? []).map((date) => ({
      ruleId: id,
      date: day(date),
    })),
    staff: staffIds.map((staffId) => ({ ruleId: id, staffId })),
  };
}
