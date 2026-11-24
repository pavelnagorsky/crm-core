import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  PriceRuleKind,
  PriceRuleTargetType,
  StaffStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { PRICE_RULE_AUDIT_FIELDS } from '../../audit/fields/price-rule.fields.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../../audit/utils/diff-fields.js';
import { LocationService } from '../../location/services/location.service.js';
import { StaffService } from '../../staff/services/staff.service.js';
import {
  PRICE_RULE_COPY_SUFFIX,
  PRICE_RULE_NAME_MAX_LENGTH,
  PROMO_CODE_ATTEMPTS,
} from '../constants/price-rule.constants.js';
import { PRICE_RULE_INCLUDE } from '../constants/price-rule.include.js';
import { PriceRuleInputDto } from '../dto/price-rule-input.dto.js';
import { NormalizedPriceRule } from '../interfaces/normalized-price-rule.interface.js';
import { PriceRuleHolidayFacts } from '../interfaces/price-rule-holiday-facts.interface.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';
import { PriceRuleTargetRef } from '../interfaces/price-rule-target-ref.interface.js';
import { PriceRuleView } from '../interfaces/price-rule-view.interface.js';
import { PromoCodeTaken } from '../interfaces/promo-code-taken.interface.js';
import { priceRuleAuditSnapshot } from '../rules/price-rule-audit.rules.js';
import { promotionColumns } from '../rules/price-rule-columns.rules.js';
import { randomPromoCode } from '../rules/promo-code.rules.js';
import { affectedServiceCount } from '../rules/price-rule-coverage.rules.js';
import {
  findHolidayConflict,
  isExclusiveHoliday,
} from '../rules/price-rule-holiday.rules.js';
import { normalizePriceRuleInput } from '../rules/price-rule-input.rules.js';
import { priceRuleSchedule } from '../rules/price-rule-schedule.rules.js';
import { PriceRuleCatalogService } from './price-rule-catalog.service.js';
import { PriceRuleReadService } from './price-rule-read.service.js';

/** Cabinet operations on the price rules (surcharges and promotions), a table the pricing module owns. */
@Injectable()
export class PriceRulesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly reads: PriceRuleReadService,
    private readonly catalog: PriceRuleCatalogService,
    private readonly locations: LocationService,
    private readonly staff: StaffService,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Archived or live rules of one kind in display order. */
  async list(
    locationId: string,
    archived: boolean,
    kind: PriceRuleKind = PriceRuleKind.SURCHARGE,
    now = new Date(),
  ): Promise<PriceRuleView[]> {
    return this.toViews(
      locationId,
      await this.reads.listRules(locationId, archived, kind),
      now,
    );
  }

  async get(
    locationId: string,
    ruleId: string,
    now = new Date(),
  ): Promise<PriceRuleView> {
    const rule = await this.reads.findRule(locationId, ruleId);
    return (await this.toViews(locationId, [rule], now))[0];
  }

  /**
   * 409 PRICE_RULE_HOLIDAY_CONFLICT when an enabled exclusive holiday rule already claims one
   * of its dates; 409 PROMO_CODE_TAKEN when a live promotion has its promo code.
   */
  async create(
    locationId: string,
    input: PriceRuleInputDto,
    actor: AuditActor,
  ): Promise<PriceRuleView> {
    const rule = normalizePriceRuleInput(input);
    await this.catalog.assertTargetsInLocation(locationId, rule.targets);
    await this.assertStaffInLocation(locationId, rule, []);
    const enabled = rule.enabled ?? true;
    const created = await this.guardPromoCode(locationId, null, rule.promotion?.promoCode ?? null, () =>
      this.db.$transaction(async (tx) => {
        await lockRules(tx, locationId);
        await this.assertNoHolidayConflict(tx, locationId, null, {
          ...rule,
          enabled,
        });
        await this.assertPromoCodeFree(
          tx,
          locationId,
          null,
          rule.promotion?.promoCode ?? null,
        );
        return tx.priceRule.create({
          data: createData(locationId, rule, enabled, actor.id ?? null),
          include: PRICE_RULE_INCLUDE,
        });
      }),
    );
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    const view = await this.viewOf(locationId, created);
    this.emit(locationId, created.id, actor, {
      eventType: AuditEvent.PRICE_RULE_CREATED,
      actionType: AuditActionType.CREATE,
      payload: { name: created.name, kind: created.kind },
    });
    return view;
  }

  /**
   * Replaces the whole content of a live rule; the kind cannot change. Created bookings keep
   * their prices.
   */
  async update(
    locationId: string,
    ruleId: string,
    input: PriceRuleInputDto,
    actor: AuditActor,
  ): Promise<PriceRuleView> {
    const rule = normalizePriceRuleInput(input);
    await this.catalog.assertTargetsInLocation(locationId, rule.targets);
    const existing = await this.reads.findRule(locationId, ruleId);
    if (existing.kind !== rule.kind)
      throw new AppException(
        ErrorCode.PRICE_RULE_INVALID,
        HttpStatus.BAD_REQUEST,
        { field: 'kind' },
      );
    await this.assertStaffInLocation(
      locationId,
      rule,
      existing.staff.map((item) => item.staffId),
    );
    const { before, after } = await this.guardPromoCode(locationId, ruleId, rule.promotion?.promoCode ?? null, () =>
      this.db.$transaction(async (tx) => {
        await lockRules(tx, locationId);
        const current = await this.reads.findRule(locationId, ruleId, tx);
        assertNotArchived(current);
        const enabled = rule.enabled ?? current.enabled;
        await this.assertNoHolidayConflict(tx, locationId, ruleId, {
          ...rule,
          enabled,
        });
        await this.assertPromoCodeFree(
          tx,
          locationId,
          ruleId,
          rule.promotion?.promoCode ?? null,
        );
        await tx.priceRuleTarget.deleteMany({ where: { ruleId } });
        await tx.priceRuleInterval.deleteMany({ where: { ruleId } });
        await tx.priceRuleDate.deleteMany({ where: { ruleId } });
        await tx.priceRuleStaff.deleteMany({ where: { ruleId } });
        const updated = await tx.priceRule.update({
          where: { id: ruleId },
          data: updateData(rule, enabled),
          include: PRICE_RULE_INCLUDE,
        });
        return { before: current, after: updated };
      }),
    );
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    const [beforeTargets, beforeStaff] = await Promise.all([
      this.catalog.nameTargets(locationId, refsOf(before)),
      this.staff.namesByIds(before.staff.map((item) => item.staffId)),
    ]);
    const view = await this.viewOf(locationId, after);
    const changes = diffFields(
      priceRuleAuditSnapshot(before, beforeTargets, beforeStaff),
      priceRuleAuditSnapshot(
        after,
        view.targets,
        new Map(view.staff.map((item) => [item.id, item.name ?? item.id])),
      ),
      PRICE_RULE_AUDIT_FIELDS,
    );
    if (changes.length > 0)
      this.emit(locationId, ruleId, actor, {
        eventType: AuditEvent.PRICE_RULE_UPDATED,
        actionType: AuditActionType.MODIFY,
        payload: { name: after.name, kind: after.kind, changes },
      });
    return view;
  }

  /** Switching to the current state changes nothing. Enabling can hit the holiday conflict. */
  async setEnabled(
    locationId: string,
    ruleId: string,
    enabled: boolean,
    actor: AuditActor,
  ): Promise<PriceRuleView> {
    const { rule, changed } = await this.db.$transaction(async (tx) => {
      await lockRules(tx, locationId);
      const current = await this.reads.findRule(locationId, ruleId, tx);
      assertNotArchived(current);
      if (current.enabled === enabled) return { rule: current, changed: false };
      if (enabled)
        await this.assertNoHolidayConflict(
          tx,
          locationId,
          ruleId,
          holidayFacts(current, true),
        );
      const updated = await tx.priceRule.update({
        where: { id: ruleId },
        data: { enabled },
        include: PRICE_RULE_INCLUDE,
      });
      return { rule: updated, changed: true };
    });
    if (changed) {
      await this.cache.invalidate(CacheDependency.pricing(locationId));
      this.emit(locationId, ruleId, actor, {
        eventType: enabled
          ? AuditEvent.PRICE_RULE_ENABLED
          : AuditEvent.PRICE_RULE_DISABLED,
        actionType: AuditActionType.MODIFY,
        payload: { name: rule.name, kind: rule.kind },
      });
    }
    return this.viewOf(locationId, rule);
  }

  /** The rule leaves the list and the price engine; archiving an archived rule changes nothing. */
  async archive(
    locationId: string,
    ruleId: string,
    actor: AuditActor,
  ): Promise<PriceRuleView> {
    const { rule, changed } = await this.db.$transaction(async (tx) => {
      await lockRules(tx, locationId);
      const current = await this.reads.findRule(locationId, ruleId, tx);
      if (current.archivedAt !== null) return { rule: current, changed: false };
      const updated = await tx.priceRule.update({
        where: { id: ruleId },
        data: { archivedAt: new Date() },
        include: PRICE_RULE_INCLUDE,
      });
      return { rule: updated, changed: true };
    });
    if (changed) {
      await this.cache.invalidate(CacheDependency.pricing(locationId));
      this.emit(locationId, ruleId, actor, {
        eventType: AuditEvent.PRICE_RULE_ARCHIVED,
        actionType: AuditActionType.MODIFY,
        payload: { name: rule.name, kind: rule.kind },
      });
    }
    return this.viewOf(locationId, rule);
  }

  /**
   * Brings the rule back as it was; an enabled exclusive holiday can hit the holiday
   * conflict, a promotion whose code another live promotion took meanwhile PROMO_CODE_TAKEN.
   */
  async restore(
    locationId: string,
    ruleId: string,
    actor: AuditActor,
  ): Promise<PriceRuleView> {
    const { rule, changed } = await this.guardPromoCode(locationId, ruleId, null, () =>
      this.db.$transaction(async (tx) => {
        await lockRules(tx, locationId);
        const current = await this.reads.findRule(locationId, ruleId, tx);
        if (current.archivedAt === null)
          return { rule: current, changed: false };
        await this.assertNoHolidayConflict(
          tx,
          locationId,
          ruleId,
          holidayFacts(current, current.enabled),
        );
        await this.assertPromoCodeFree(
          tx,
          locationId,
          ruleId,
          current.promoCode,
        );
        const updated = await tx.priceRule.update({
          where: { id: ruleId },
          data: { archivedAt: null },
          include: PRICE_RULE_INCLUDE,
        });
        return { rule: updated, changed: true };
      }),
    );
    if (changed) {
      await this.cache.invalidate(CacheDependency.pricing(locationId));
      this.emit(locationId, ruleId, actor, {
        eventType: AuditEvent.PRICE_RULE_RESTORED,
        actionType: AuditActionType.MODIFY,
        payload: { name: rule.name, kind: rule.kind },
      });
    }
    return this.viewOf(locationId, rule);
  }

  /**
   * A disabled copy named "Name (копия)", live whether or not the source is archived. A
   * promotion copy has no promo code: codes are unique.
   */
  async duplicate(
    locationId: string,
    ruleId: string,
    actor: AuditActor,
  ): Promise<PriceRuleView> {
    const created = await this.db.$transaction(async (tx) => {
      await lockRules(tx, locationId);
      const source = await this.reads.findRule(locationId, ruleId, tx);
      return tx.priceRule.create({
        data: {
          locationId,
          kind: source.kind,
          scheduleType: source.scheduleType,
          name: copyName(source.name),
          note: source.note,
          enabled: false,
          valueType: source.valueType,
          value: source.value,
          visitFrom: source.visitFrom,
          visitTo: source.visitTo,
          yearly: source.yearly,
          holidayExclusive: source.holidayExclusive,
          weekdaysMask: source.weekdaysMask,
          appliesToAll: source.appliesToAll,
          scenario: source.scenario,
          publicName: source.publicName,
          publicDescription: source.publicDescription,
          showAsPromotion: source.showAsPromotion,
          bookingFrom: source.bookingFrom,
          bookingTo: source.bookingTo,
          minLeadMinutes: source.minLeadMinutes,
          maxLeadMinutes: source.maxLeadMinutes,
          channels: source.channels,
          clientFilter: source.clientFilter,
          birthdayWindowDays: source.birthdayWindowDays,
          promoCode: null,
          usageLimitTotal: source.usageLimitTotal,
          usageLimitPerClient: source.usageLimitPerClient,
          usageLimitPeriod: source.usageLimitPeriod,
          minVisitTotal: source.minVisitTotal,
          createdById: actor.id ?? null,
          targets: {
            create: source.targets.map(
              ({ targetType, targetId, excluded }) => ({
                targetType,
                targetId,
                excluded,
              }),
            ),
          },
          intervals: {
            create: source.intervals.map(({ startMinute, endMinute }) => ({
              startMinute,
              endMinute,
            })),
          },
          dates: { create: source.dates.map(({ date }) => ({ date })) },
          staff: {
            create: source.staff.map(({ staffId }) => ({ staffId })),
          },
        },
        include: PRICE_RULE_INCLUDE,
      });
    });
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    const view = await this.viewOf(locationId, created);
    this.emit(locationId, created.id, actor, {
      eventType: AuditEvent.PRICE_RULE_CREATED,
      actionType: AuditActionType.CREATE,
      payload: { name: created.name, copiedFrom: ruleId },
    });
    return view;
  }

  /**
   * A random promo code no live promotion of the location has: 8 characters without the
   * look-alikes 0/O and 1/I.
   */
  async generatePromoCode(locationId: string): Promise<string> {
    for (let attempt = 0; attempt < PROMO_CODE_ATTEMPTS; attempt += 1) {
      const code = randomPromoCode();
      if (!(await this.reads.findPromoCodeOwner(locationId, code, null)))
        return code;
    }
    // 32^8 codes: reaching this means something else is wrong.
    throw new Error('No free promo code found');
  }

  /**
   * Drops the rule targets that point at a service, category or bundle that was deleted.
   * The rules stay. Targets are polymorphic, so no foreign key does this.
   */
  async removeTargets(
    locationId: string,
    targetType: PriceRuleTargetType,
    targetId: string,
  ): Promise<void> {
    const { count } = await this.db.priceRuleTarget.deleteMany({
      where: { targetType, targetId, rule: { locationId } },
    });
    if (count > 0)
      await this.cache.invalidate(CacheDependency.pricing(locationId));
  }

  /**
   * Promotion staff must be active staff of the location; staff the rule already has stay
   * allowed when they left, so the rule can still be saved.
   */
  private async assertStaffInLocation(
    locationId: string,
    rule: NormalizedPriceRule,
    current: readonly string[],
  ): Promise<void> {
    const staffIds = rule.promotion?.staffIds ?? [];
    if (staffIds.length === 0) return;
    const members = await this.staff.listInLocation(locationId);
    const allowed = new Set([
      ...members
        .filter((member) => member.status === StaffStatus.ACTIVE)
        .map((member) => member.id),
      ...current.filter((id) => members.some((member) => member.id === id)),
    ]);
    if (staffIds.some((id) => !allowed.has(id)))
      throw new AppException(
        ErrorCode.PRICE_RULE_INVALID,
        HttpStatus.BAD_REQUEST,
        { field: 'staffIds' },
      );
  }

  /** 409 PROMO_CODE_TAKEN { ruleId, ruleName } when another live promotion has the code. */
  private async assertPromoCodeFree(
    tx: Prisma.TransactionClient,
    locationId: string,
    ruleId: string | null,
    promoCode: string | null,
  ): Promise<void> {
    if (promoCode === null) return;
    const owner = await this.reads.findPromoCodeOwner(
      locationId,
      promoCode,
      ruleId,
      tx,
    );
    if (owner) throw promoCodeTaken(owner);
  }

  /**
   * The unique index on live promo codes is the last guard: a write that still hits it is
   * reported as PROMO_CODE_TAKEN like the locked check.
   */
  private async guardPromoCode<T>(
    locationId: string,
    ruleId: string | null,
    promoCode: string | null,
    write: () => Promise<T>,
  ): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION
      )
        throw error;
      // A restore saves the code the rule already has.
      const code =
        promoCode ??
        (ruleId === null
          ? null
          : ((
              await this.db.priceRule.findFirst({
                where: { id: ruleId, locationId },
                select: { promoCode: true },
              })
            )?.promoCode ?? null));
      const owner =
        code === null
          ? null
          : await this.reads.findPromoCodeOwner(locationId, code, ruleId);
      if (!owner) throw error;
      throw promoCodeTaken(owner);
    }
  }

  private async assertNoHolidayConflict(
    tx: Prisma.TransactionClient,
    locationId: string,
    ruleId: string | null,
    rule: PriceRuleHolidayFacts,
  ): Promise<void> {
    if (!isExclusiveHoliday(rule)) return;
    const others = await this.reads.listExclusiveHolidays(
      locationId,
      ruleId,
      tx,
    );
    const conflict = findHolidayConflict(rule, others);
    if (conflict)
      throw new AppException(
        ErrorCode.PRICE_RULE_HOLIDAY_CONFLICT,
        HttpStatus.CONFLICT,
        conflict,
      );
  }

  private async viewOf(
    locationId: string,
    rule: PriceRuleRecord,
  ): Promise<PriceRuleView> {
    return (await this.toViews(locationId, [rule], new Date()))[0];
  }

  /**
   * Names of the targets and staff, coverage counts and the schedule of each rule, from one
   * read of each source.
   */
  private async toViews(
    locationId: string,
    rules: readonly PriceRuleRecord[],
    now: Date,
  ): Promise<PriceRuleView[]> {
    if (rules.length === 0) return [];
    const staffIds = [
      ...new Set(rules.flatMap((rule) => rule.staff.map((item) => item.staffId))),
    ];
    const [{ timezone, currency }, coverage, names, staffNames] =
      await Promise.all([
        this.locations.getBookingSettings(locationId),
        this.catalog.loadCoverage(locationId),
        this.catalog.nameTargets(locationId, rules.flatMap(refsOf)),
        this.staff.namesByIds(staffIds),
      ]);
    const today = TimeUtils.zonedDateStr(now, timezone);
    const nameOf = new Map(
      names.map((target) => [`${target.type}:${target.id}`, target.name]),
    );
    return rules.map((rule) => {
      const refs = refsOf(rule);
      return {
        rule,
        targets: refs.map((ref) => ({
          ...ref,
          name: nameOf.get(`${ref.type}:${ref.id}`) ?? null,
        })),
        staff: rule.staff.map(({ staffId }) => ({
          id: staffId,
          name: staffNames.get(staffId) ?? null,
        })),
        currency,
        serviceCount: affectedServiceCount(
          { appliesToAll: rule.appliesToAll, targets: refs },
          coverage,
        ),
        ...priceRuleSchedule(rule, today),
      };
    });
  }

  private emit(
    locationId: string,
    ruleId: string,
    actor: AuditActor,
    event: Pick<AuditLogEvent, 'eventType' | 'actionType' | 'payload'>,
  ): void {
    const logEvent: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.PRICE_RULE,
      entityId: ruleId,
      occurredAt: new Date(),
      actor,
      ...event,
    };
    this.eventEmitter.emit(AUDIT_EVENT, logEvent);
  }
}

function promoCodeTaken(owner: { id: string; name: string }): AppException {
  const payload: PromoCodeTaken = { ruleId: owner.id, ruleName: owner.name };
  return new AppException(
    ErrorCode.PROMO_CODE_TAKEN,
    HttpStatus.CONFLICT,
    payload,
  );
}

function holidayFacts(
  rule: PriceRuleRecord,
  enabled: boolean,
): PriceRuleHolidayFacts {
  return {
    scheduleType: rule.scheduleType,
    holidayExclusive: rule.holidayExclusive,
    enabled,
    yearly: rule.yearly,
    dates: rule.dates.map((item) => TimeUtils.dateOnlyStr(item.date)),
  };
}

function refsOf(rule: PriceRuleRecord): PriceRuleTargetRef[] {
  return rule.targets.map((target) => ({
    type: target.targetType,
    id: target.targetId,
    excluded: target.excluded,
  }));
}

function assertNotArchived(rule: PriceRuleRecord): void {
  if (rule.archivedAt !== null)
    throw new AppException(ErrorCode.PRICE_RULE_ARCHIVED, HttpStatus.CONFLICT);
}

function copyName(name: string): string {
  const room = PRICE_RULE_NAME_MAX_LENGTH - PRICE_RULE_COPY_SUFFIX.length;
  return `${name.slice(0, room)}${PRICE_RULE_COPY_SUFFIX}`;
}

const day = (date: string | null): Date | null =>
  date === null ? null : TimeUtils.dateOnly(date);

function children(rule: NormalizedPriceRule) {
  return {
    targets: {
      create: rule.targets.map((target) => ({
        targetType: target.type,
        targetId: target.id,
        excluded: target.excluded,
      })),
    },
    intervals: { create: rule.intervals },
    dates: {
      create: rule.dates.map((date) => ({ date: TimeUtils.dateOnly(date) })),
    },
    staff: {
      create: (rule.promotion?.staffIds ?? []).map((staffId) => ({ staffId })),
    },
  };
}

function updateData(
  rule: NormalizedPriceRule,
  enabled: boolean,
): Prisma.PriceRuleUpdateInput {
  return {
    scheduleType: rule.scheduleType,
    name: rule.name,
    note: rule.note,
    enabled,
    valueType: rule.valueType,
    value: rule.value,
    visitFrom: day(rule.visitFrom),
    visitTo: day(rule.visitTo),
    yearly: rule.yearly,
    holidayExclusive: rule.holidayExclusive,
    weekdaysMask: rule.weekdaysMask,
    appliesToAll: rule.appliesToAll,
    ...promotionColumns(rule),
    ...children(rule),
  };
}

function createData(
  locationId: string,
  rule: NormalizedPriceRule,
  enabled: boolean,
  createdById: string | null,
): Prisma.PriceRuleUncheckedCreateInput {
  return {
    locationId,
    kind: rule.kind,
    scheduleType: rule.scheduleType,
    name: rule.name,
    note: rule.note,
    enabled,
    valueType: rule.valueType,
    value: rule.value,
    visitFrom: day(rule.visitFrom),
    visitTo: day(rule.visitTo),
    yearly: rule.yearly,
    holidayExclusive: rule.holidayExclusive,
    weekdaysMask: rule.weekdaysMask,
    appliesToAll: rule.appliesToAll,
    ...promotionColumns(rule),
    createdById,
    ...children(rule),
  };
}

/** Serializes the rule writes of one location until the transaction ends. */
async function lockRules(
  tx: Prisma.TransactionClient,
  locationId: string,
): Promise<void> {
  const key = JSON.stringify(['price-rules', locationId]);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
