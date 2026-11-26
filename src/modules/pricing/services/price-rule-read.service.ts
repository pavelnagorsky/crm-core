import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PriceRule,
  PriceRuleKind,
  PriceScheduleType,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PRICE_RULE_INCLUDE } from '../constants/price-rule.include.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';

const DISPLAY_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

/** Reads the price rules (surcharges and promotions), a table the pricing module owns. */
@Injectable()
export class PriceRuleReadService {
  constructor(private readonly db: DatabaseService) {}

  /** Archived or live rules of one kind of the location in display order. */
  listRules(
    locationId: string,
    archived: boolean,
    kind: PriceRuleKind = PriceRuleKind.SURCHARGE,
  ): Promise<PriceRuleRecord[]> {
    return this.db.priceRule.findMany({
      where: { locationId, kind, archivedAt: archived ? { not: null } : null },
      include: PRICE_RULE_INCLUDE,
      orderBy: DISPLAY_ORDER,
    });
  }

  /** Rules the price engine reads: not archived, disabled ones included. */
  listForSnapshot(locationId: string): Promise<PriceRuleRecord[]> {
    return this.db.priceRule.findMany({
      where: { locationId, archivedAt: null },
      include: PRICE_RULE_INCLUDE,
      orderBy: DISPLAY_ORDER,
    });
  }

  /** The rule of the location, or a 404 when it is missing or belongs to another location. */
  async findRule(
    locationId: string,
    ruleId: string,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<PriceRuleRecord> {
    const rule = await tx.priceRule.findFirst({
      where: { id: ruleId, locationId },
      include: PRICE_RULE_INCLUDE,
    });
    if (!rule)
      throw new AppException(
        ErrorCode.PRICE_RULE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return rule;
  }

  /** Enabled exclusive holiday rules of the location, the one being saved left out. */
  listExclusiveHolidays(
    locationId: string,
    exceptRuleId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<PriceRuleRecord[]> {
    return tx.priceRule.findMany({
      where: {
        locationId,
        archivedAt: null,
        enabled: true,
        scheduleType: PriceScheduleType.HOLIDAYS,
        holidayExclusive: true,
        ...(exceptRuleId !== null && { id: { not: exceptRuleId } }),
      },
      include: PRICE_RULE_INCLUDE,
      orderBy: DISPLAY_ORDER,
    });
  }

  /**
   * The live promotion of the location with this code (upper case; codes are stored upper
   * case), the one being saved left out; null when the code is free.
   */
  findPromoCodeOwner(
    locationId: string,
    promoCode: string,
    exceptRuleId: string | null,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<{ id: string; name: string } | null> {
    return tx.priceRule.findFirst({
      where: {
        locationId,
        kind: PriceRuleKind.PROMOTION,
        archivedAt: null,
        promoCode: { equals: promoCode, mode: 'insensitive' },
        ...(exceptRuleId !== null && { id: { not: exceptRuleId } }),
      },
      select: { id: true, name: true },
    });
  }

  /** Live promotions of the location that are enabled, in display order. */
  listLivePromotions(locationId: string): Promise<PriceRuleRecord[]> {
    return this.db.priceRule.findMany({
      where: {
        locationId,
        kind: PriceRuleKind.PROMOTION,
        archivedAt: null,
        enabled: true,
      },
      include: PRICE_RULE_INCLUDE,
      orderBy: DISPLAY_ORDER,
    });
  }

  /** Rules of the location with these ids, archived ones included, without their parts. */
  listByIds(locationId: string, ids: readonly string[]): Promise<PriceRule[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.priceRule.findMany({
      where: { locationId, id: { in: [...ids] } },
    });
  }
}
