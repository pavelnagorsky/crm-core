import {
  PriceRuleKind,
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
  appliesToAll?: boolean;
  intervals?: [number, number][];
  dates?: string[];
  targets?: [PriceRuleTargetType, string, boolean?][];
  createdAt?: Date;
}

/** A stored rule: by default a weekly +20% on every service, enabled, every day. */
export function priceRuleRecord(
  options: PriceRuleRecordOptions = {},
): PriceRuleRecord {
  const id = options.id ?? 'rule-1';
  return {
    id,
    locationId: 'location',
    kind: PriceRuleKind.SURCHARGE,
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
    appliesToAll: options.appliesToAll ?? true,
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
  };
}
