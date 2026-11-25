import { DiscountChoiceMode } from './enums/discount-choice-mode.enum.js';
import { PriceAdjustmentKind } from './enums/price-adjustment-kind.enum.js';
import { PriceRuleKind } from './enums/price-rule-kind.enum.js';
import { PriceRuleSkipReason } from './enums/price-rule-skip-reason.enum.js';
import { PriceRuleTargetType } from './enums/price-rule-target-type.enum.js';
import { PriceValueType } from './enums/price-value-type.enum.js';
import { PromoCodeStatus } from './enums/promo-code-status.enum.js';
import { PromotionChannel } from './enums/promotion-channel.enum.js';
import { PromotionClientFilter } from './enums/promotion-client-filter.enum.js';
import { LineQuote } from './interfaces/line-quote.interface.js';
import { PricingPromotionEntry } from './interfaces/pricing-promotion-entry.interface.js';
import { PricingRuleEntry } from './interfaces/pricing-rule-entry.interface.js';
import { QuoteClient } from './interfaces/quote-client.interface.js';
import { QuoteContext } from './interfaces/quote-context.interface.js';
import { VisitQuote } from './interfaces/visit-quote.interface.js';
import { VisitTime } from './interfaces/visit-time.interface.js';
import { PriceBook } from './price-book.js';
import {
  fixedBundle,
  priceLevel,
  pricingSnapshot,
  pricingStaff,
  promotionRule,
  quoteContext,
  quoteLine,
  sumBundle,
  surchargeRule,
  visitAt,
  weekdays,
  PRICING_TODAY,
} from './testing/pricing-snapshot.factory.js';

/**
 * Catalog: cut 60.00, color 90.00 (category hair), wash 15.00, polish 49.90, odd 43.00.
 * Senior level: cut 80.00. 2026-11-23 is a Monday. Pricing moment 2026-11-23 09:00 UTC.
 */
const { PERCENT, AMOUNT } = PriceValueType;
const { NOT_APPLICABLE, APPLIED, BETTER_APPLIED, NOT_FOUND } = PromoCodeStatus;
const R = PriceRuleSkipReason;
const MONDAY = '2026-11-23';
const noon = visitAt(MONDAY, '12:00');
const NOW = Date.UTC(2026, 10, 23, 9, 0);
const MINUTE = 60_000;

const knownClient = (overrides: Partial<QuoteClient> = {}): QuoteClient => ({
  known: true,
  isNew: false,
  birthday: null,
  discountBp: null,
  ...overrides,
});

function book(rules: PricingRuleEntry[], roundingStep = 100): PriceBook {
  return new PriceBook(
    pricingSnapshot({
      services: { cut: 6000, color: 9000, wash: 1500, polish: 4990, odd: 4300 },
      categories: { cut: 'hair', color: 'hair' },
      levels: [priceLevel('base', 'Базовый', true), priceLevel('senior', 'Старший')],
      levelPrices: { cut: { senior: 8000 } },
      staff: [pricingStaff('anna'), pricingStaff('boris', 'senior')],
      bundles: [
        sumBundle('sum-bundle'),
        fixedBundle('fixed-bundle', 12000),
        fixedBundle('odd-bundle', 4990, ['cut', 'wash']),
      ],
      rules,
      roundingStep,
    }),
    PRICING_TODAY,
  );
}

function quote(
  rules: PricingRuleEntry[],
  serviceIds: string[],
  context: Partial<QuoteContext> = {},
  options: {
    visit?: VisitTime | null;
    staffId?: string | null;
    roundingStep?: number;
    bundleId?: string | null;
    customPrice?: number | null;
  } = {},
): VisitQuote {
  return book(rules, options.roundingStep).quote({
    bundleId: options.bundleId ?? null,
    lines: serviceIds.map((serviceId) =>
      quoteLine(serviceId, options.customPrice ?? null, options.staffId ?? 'anna'),
    ),
    visit: options.visit === undefined ? noon : options.visit,
    context: quoteContext(context),
  });
}

function line(
  rules: PricingRuleEntry[],
  serviceId: string,
  context: Partial<QuoteContext> = {},
  options: Parameters<typeof quote>[3] = {},
): LineQuote {
  return quote(rules, [serviceId], context, options).lines[0];
}

/** Why a single promotion did not reach a cut at noon, or null when it applied. */
function reasonOf(
  conditions: Partial<PricingPromotionEntry>,
  context: Partial<QuoteContext> = {},
  options: Parameters<typeof quote>[3] = {},
  overrides: Partial<PricingRuleEntry> = {},
): PriceRuleSkipReason | null {
  const rule = promotionRule('promo', overrides, conditions);
  const quoted = line([rule], 'cut', context, options);
  if (quoted.discount?.ruleId === 'promo') return null;
  return quoted.ineligible.find((skip) => skip.ruleId === 'promo')?.reason ?? null;
}

describe('PriceBook: promotions and the client discount (docs/pricing-stage4-api.md)', () => {
  describe('size of the discount', () => {
    it.each([
      ['60.00 - 10% = 54.00', 'cut', PERCENT, 1000, 100, 5400],
      ['43.00 - 15% = 36.55 -> 36.00 (down)', 'odd', PERCENT, 1500, 100, 3600],
      ['49.90 - 10% = 44.91 -> 44.00 (down)', 'polish', PERCENT, 1000, 100, 4400],
      ['49.90 - 10% = 44.91 -> 44.50 (step 0.50)', 'polish', PERCENT, 1000, 50, 4450],
      ['step 0.01: 44.91', 'polish', PERCENT, 1000, 1, 4491],
      ['60.00 - 5.00 = 55.00', 'cut', AMOUNT, 500, 100, 5500],
      ['49.90 - 5.00 = 44.90 -> 44.00', 'polish', AMOUNT, 500, 100, 4400],
      ['below zero: 15.00 - 20.00 = 0', 'wash', AMOUNT, 2000, 100, 0],
      ['100%: 0', 'cut', PERCENT, 10000, 100, 0],
    ] as const)('%s', (_name, serviceId, valueType, value, step, charged) => {
      const rule = promotionRule('promo', { valueType, value, name: 'Внутр.' });
      const quoted = line([rule], serviceId, {}, { roundingStep: step });
      expect(quoted.chargedPrice).toBe(charged);
      expect(quoted.total).toBe(charged);
      expect(quoted.discountTotal).toBe(quoted.listPrice - charged);
      expect(quoted.discount).toEqual({
        kind: PriceAdjustmentKind.PROMOTION,
        ruleId: 'promo',
        title: 'Внутр.',
        publicTitle: 'Акция promo',
        valueType,
        value,
        amount: charged - quoted.listPrice,
      });
      expect(quoted.adjustments[quoted.adjustments.length - 1]).toEqual(quoted.discount);
    });

    it('discount counts from the list price: level and surcharge first', () => {
      const plus = surchargeRule('plus', { value: 1000 });
      const quoted = line([plus, promotionRule('promo')], 'cut', {}, { staffId: 'boris' });
      expect(quoted).toMatchObject({ staffPrice: 8000, listPrice: 8800, chargedPrice: 7900 });
      expect(quoted.adjustments.map((item) => item.kind)).toEqual([
        PriceAdjustmentKind.LEVEL,
        PriceAdjustmentKind.SURCHARGE,
        PriceAdjustmentKind.PROMOTION,
      ]);
    });

    it('AMOUNT applies to every line it reaches, not to the visit', () => {
      const rule = promotionRule('promo', { valueType: AMOUNT, value: 500 });
      const quoted = quote([rule], ['cut', 'color']);
      expect(quoted.lines.map((item) => item.discountTotal)).toEqual([500, 500]);
      expect(quoted).toMatchObject({ listTotal: 15000, discountTotal: 1000, total: 14000 });
    });

    it('showAsPromotion = false: no public title, the layer is stored in full', () => {
      const rule = promotionRule('hidden', {}, { showAsPromotion: false });
      expect(line([rule], 'cut').discount).toMatchObject({
        ruleId: 'hidden',
        title: 'hidden',
        publicTitle: null,
        amount: -600,
      });
    });

    it('a custom price has no candidates', () => {
      const quoted = line([promotionRule('promo')], 'cut', {}, { customPrice: 4000 });
      expect(quoted).toMatchObject({
        discountTotal: 0,
        chargedPrice: 6000,
        total: 4000,
        discount: null,
        eligible: [],
        ineligible: [],
      });
    });

    it('no context: no discounts (stage 3)', () => {
      const quoted = book([promotionRule('promo')]).quote({
        bundleId: null,
        lines: [quoteLine('cut')],
        visit: noon,
      });
      expect(quoted.lines[0]).toMatchObject({ chargedPrice: 6000, discount: null });
      expect(quoted.promoCode).toBeNull();
    });

    it('no visit time: promotions do not apply, the client discount does', () => {
      const quoted = line([promotionRule('promo')], 'cut', {
        client: knownClient({ discountBp: 500 }),
      }, { visit: null });
      expect(quoted.discount).toMatchObject({
        kind: PriceAdjustmentKind.CLIENT_DISCOUNT,
        ruleId: null,
        title: 'Скидка клиента',
        publicTitle: 'Ваша скидка',
        amount: -300,
      });
    });
  });

  describe('schedule and targets', () => {
    it.each([
      ['empty weekdays: every day', {}, null],
      ['weekdays without Monday', { weekdaysMask: weekdays(2, 3) }, R.WRONG_WEEKDAY],
      ['interval 10:00-12:00 (12:00 excluded)', { intervals: [{ start: 600, end: 720 }] }, R.OUT_OF_INTERVAL],
      ['interval 12:00-13:00 (12:00 included)', { intervals: [{ start: 720, end: 780 }] }, null],
      ['visit period ended', { visitTo: '2026-11-22' }, R.OUT_OF_PERIOD],
      ['visit period from today', { visitFrom: MONDAY }, null],
      ['disabled', { enabled: false }, null],
      [
        'targets another service',
        { appliesToAll: false, targets: [{ type: PriceRuleTargetType.SERVICE, id: 'wash', excluded: false }] },
        null,
      ],
    ] as const)('%s', (_name, overrides, reason) => {
      const rule = promotionRule('promo', { ...overrides } as Partial<PricingRuleEntry>);
      const quoted = line([rule], 'cut');
      const applies = reason === null && overrides !== null && !('enabled' in overrides) && !('targets' in overrides);
      expect(quoted.discount?.ruleId ?? null).toBe(applies ? 'promo' : null);
      expect(quoted.ineligible.find((skip) => skip.ruleId === 'promo')?.reason ?? null).toBe(reason);
    });

    it('disabled and untargeted promotions are not in the menu', () => {
      const off = promotionRule('off', { enabled: false });
      const other = promotionRule('other', {
        appliesToAll: false,
        targets: [{ type: PriceRuleTargetType.SERVICE, id: 'wash', excluded: false }],
      });
      expect(line([off, other], 'cut')).toMatchObject({ eligible: [], ineligible: [] });
    });
  });

  describe('conditions', () => {
    it.each([
      ['channel ONLINE only, online', { channels: [PromotionChannel.ONLINE] }, {}, null],
      [
        'channel ADMIN only, online',
        { channels: [PromotionChannel.ADMIN] },
        {},
        R.WRONG_CHANNEL,
      ],
      [
        'channel ONLINE only, admin',
        { channels: [PromotionChannel.ONLINE] },
        { channel: PromotionChannel.ADMIN },
        R.WRONG_CHANNEL,
      ],
      ['staff: Anna', { staffIds: ['anna'] }, {}, null],
      ['staff: Boris only', { staffIds: ['boris'] }, {}, R.WRONG_STAFF],
      ['booking period includes today', { bookingFrom: MONDAY, bookingTo: MONDAY }, {}, null],
      ['booking period not started', { bookingFrom: '2026-11-24' }, {}, R.OUT_OF_BOOKING_PERIOD],
      ['booking period ended', { bookingTo: '2026-11-22' }, {}, R.OUT_OF_BOOKING_PERIOD],
      // Last-minute: no later than 180 minutes before the visit.
      ['max lead: exactly 180 min', { maxLeadMinutes: 180 }, { visitStartMs: NOW + 180 * MINUTE }, null],
      ['max lead: 181 min', { maxLeadMinutes: 180 }, { visitStartMs: NOW + 181 * MINUTE }, R.LEAD_TIME_TOO_LONG],
      ['max lead: visit start unknown', { maxLeadMinutes: 180 }, {}, R.LEAD_TIME_TOO_LONG],
      // In advance: no earlier than 7 days before the visit.
      ['min lead: exactly 7 days', { minLeadMinutes: 10080 }, { visitStartMs: NOW + 10080 * MINUTE }, null],
      [
        'min lead: a minute short',
        { minLeadMinutes: 10080 },
        { visitStartMs: NOW + 10079 * MINUTE },
        R.LEAD_TIME_TOO_SHORT,
      ],
      ['min lead: visit start unknown', { minLeadMinutes: 10080 }, {}, R.LEAD_TIME_TOO_SHORT],
      [
        'both: inside',
        { minLeadMinutes: 60, maxLeadMinutes: 120 },
        { visitStartMs: NOW + 90 * MINUTE },
        null,
      ],
      ['new: unknown client', { clientFilter: PromotionClientFilter.NEW }, {}, R.CLIENT_UNKNOWN],
      [
        'new: new client',
        { clientFilter: PromotionClientFilter.NEW },
        { client: knownClient({ isNew: true }) },
        null,
      ],
      [
        'new: returning or imported client',
        { clientFilter: PromotionClientFilter.NEW },
        { client: knownClient({ isNew: false }) },
        R.NOT_NEW_CLIENT,
      ],
      [
        'birthday: unknown client',
        { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: 7 },
        {},
        R.CLIENT_UNKNOWN,
      ],
      [
        'birthday: no birth date',
        { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: 7 },
        { client: knownClient() },
        R.NO_BIRTH_DATE,
      ],
      [
        'birthday: 7 days before (Nov 30)',
        { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: 7 },
        { client: knownClient({ birthday: '11-30' }) },
        null,
      ],
      [
        'birthday: 8 days before (Dec 1)',
        { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: 7 },
        { client: knownClient({ birthday: '12-01' }) },
        R.NOT_BIRTHDAY,
      ],
      [
        'birthday: 7 days after (Nov 16)',
        { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: 7 },
        { client: knownClient({ birthday: '11-16' }) },
        null,
      ],
      ['promo code required', { promoCode: 'AUTUMN' }, {}, R.PROMO_CODE_REQUIRED],
      ['promo code wrong', { promoCode: 'AUTUMN' }, { promoCode: 'SPRING' }, R.PROMO_CODE_REQUIRED],
      ['promo code, any case and spaces', { promoCode: 'AUTUMN' }, { promoCode: ' autumn ' }, null],
      ['min visit total 60.00 reached', { minVisitTotal: 6000 }, {}, null],
      ['min visit total 60.01', { minVisitTotal: 6001 }, {}, R.BELOW_MIN_TOTAL],
      ['total limit left', { usageLimitTotal: 100 }, { usage: { promo: { total: 99, perClient: 0 } } }, null],
      [
        'total limit reached',
        { usageLimitTotal: 100 },
        { usage: { promo: { total: 100, perClient: 0 } } },
        R.LIMIT_REACHED,
      ],
      [
        'client limit reached',
        { usageLimitPerClient: 1 },
        { client: knownClient(), usage: { promo: { total: 3, perClient: 1 } } },
        R.CLIENT_LIMIT_REACHED,
      ],
      ['client limit, no usage counted', { usageLimitPerClient: 1 }, { client: knownClient() }, null],
    ] as const)('%s', (_name, conditions, context, reason) => {
      expect(reasonOf({ ...conditions } as Partial<PricingPromotionEntry>, { ...context } as Partial<QuoteContext>)).toBe(reason);
    });

    it.each([
      ['across the new year: Dec 28 birthday, Jan 3 visit', '12-28', '2027-01-03', 7, null],
      ['across the new year: Jan 3 birthday, Dec 28 visit', '01-03', '2026-12-28', 7, null],
      ['across the new year: 8 days', '12-26', '2027-01-03', 7, R.NOT_BIRTHDAY],
      ['window 0: the day itself', '11-23', MONDAY, 0, null],
      ['window 0: next day', '11-24', MONDAY, 0, R.NOT_BIRTHDAY],
      ['Feb 29 in a common year is Feb 28', '02-29', '2027-02-28', 0, null],
      ['Feb 29 in a common year: Mar 1 is a day off', '02-29', '2027-03-01', 0, R.NOT_BIRTHDAY],
      ['Feb 29 in a leap year: Feb 28 is a day off', '02-29', '2028-02-28', 0, R.NOT_BIRTHDAY],
      ['Feb 29 in a leap year', '02-29', '2028-02-29', 0, null],
    ] as const)('birthday %s', (_name, birthday, date, window, reason) => {
      expect(
        reasonOf(
          { clientFilter: PromotionClientFilter.BIRTHDAY, birthdayWindowDays: window },
          { client: knownClient({ birthday }) },
          { visit: visitAt(date, '12:00') },
        ),
      ).toBe(reason);
    });

    it('min visit total looks at the list total of the whole visit', () => {
      const rule = promotionRule('promo', {}, { minVisitTotal: 7500 });
      expect(line([rule], 'cut').discount).toBeNull();
      expect(quote([rule], ['cut', 'wash']).lines.map((item) => item.discountTotal)).toEqual([
        600, 200, // 15.00 - 10% = 13.50 -> 13.00
      ]);
    });

    it('checks follow the order of the reasons: channel before the client', () => {
      expect(
        reasonOf({ channels: [PromotionChannel.ADMIN], clientFilter: PromotionClientFilter.NEW }),
      ).toBe(R.WRONG_CHANNEL);
    });
  });

  describe('best discount', () => {
    const ten = promotionRule('ten', { createdAt: '2026-01-01T00:00:00.000Z' });
    const tenLater = promotionRule('ten-later', { createdAt: '2026-02-01T00:00:00.000Z' });
    const fifteen = promotionRule('fifteen', { value: 1500 });
    const fiveByn = promotionRule('five-byn', { valueType: AMOUNT, value: 500 });

    it.each([
      ['the bigger discount wins', [ten, fifteen], {}, 'fifteen'],
      ['equal money: the earlier promotion', [tenLater, ten], {}, 'ten'],
      ['10% of 60.00 beats 5.00', [fiveByn, ten], {}, 'ten'],
      [
        'equal money: the client discount beats a promotion',
        [ten],
        { client: knownClient({ discountBp: 1000 }) },
        null,
      ],
      ['a bigger client discount', [ten], { client: knownClient({ discountBp: 2000 }) }, null],
      ['a smaller client discount loses', [fifteen], { client: knownClient({ discountBp: 500 }) }, 'fifteen'],
      ['an unknown client has no discount', [ten], { client: { ...knownClient({ discountBp: 5000 }), known: false } }, 'ten'],
    ] as const)('%s', (_name, rules, context, winner) => {
      const quoted = line([...rules], 'cut', context as Partial<QuoteContext>);
      expect(quoted.discount?.ruleId).toBe(winner);
      expect(quoted.discount?.kind).toBe(
        winner === null ? PriceAdjustmentKind.CLIENT_DISCOUNT : PriceAdjustmentKind.PROMOTION,
      );
      // Never two discounts on one line.
      expect(
        quoted.adjustments.filter(
          (item) =>
            item.kind === PriceAdjustmentKind.PROMOTION ||
            item.kind === PriceAdjustmentKind.CLIENT_DISCOUNT,
        ),
      ).toHaveLength(1);
    });

    it('eligible lists every applicable discount, best first, with prices', () => {
      const quoted = line([fiveByn, ten, fifteen], 'cut', {
        client: knownClient({ discountBp: 1000 }),
      });
      expect(quoted.eligible.map((item) => [item.ruleId, item.amount, item.chargedPrice])).toEqual([
        ['fifteen', 900, 5100],
        [null, 600, 5400],
        ['ten', 600, 5400],
        ['five-byn', 500, 5500],
      ]);
    });

    it('the choice is per line', () => {
      const rule = promotionRule('cut-only', {
        appliesToAll: false,
        targets: [{ type: PriceRuleTargetType.SERVICE, id: 'cut', excluded: false }],
      });
      const quoted = quote([rule, fiveByn], ['cut', 'wash']);
      expect(quoted.lines.map((item) => item.discount?.ruleId)).toEqual(['cut-only', 'five-byn']);
    });
  });

  describe('administrator choice', () => {
    const ten = promotionRule('ten');
    const fifteen = promotionRule('fifteen', { value: 1500 });
    const adminOnly = promotionRule('admin-only', { value: 500 }, { channels: [PromotionChannel.ADMIN] });

    it.each([
      ['AUTO: the best', { mode: DiscountChoiceMode.AUTO }, 'fifteen', 900],
      ['NONE: no discount', { mode: DiscountChoiceMode.NONE }, undefined, 0],
      ['RULE: a smaller one', { mode: DiscountChoiceMode.RULE, ruleId: 'ten' }, 'ten', 600],
      ['RULE: not applicable gives none', { mode: DiscountChoiceMode.RULE, ruleId: 'admin-only' }, undefined, 0],
      ['RULE: unknown rule gives none', { mode: DiscountChoiceMode.RULE, ruleId: 'nope' }, undefined, 0],
      ['CLIENT_DISCOUNT', { mode: DiscountChoiceMode.CLIENT_DISCOUNT }, null, 300],
      // A stored choice applied again (stage 5): kept while it applies, else the best one.
      ['stored RULE that applies', { mode: DiscountChoiceMode.RULE, ruleId: 'ten', fallbackToAuto: true }, 'ten', 600],
      ['stored RULE that no longer applies: the best', { mode: DiscountChoiceMode.RULE, ruleId: 'admin-only', fallbackToAuto: true }, 'fifteen', 900],
      ['stored NONE stays', { mode: DiscountChoiceMode.NONE, fallbackToAuto: true }, undefined, 0],
    ] as const)('%s', (_name, choice, ruleId, discount) => {
      const quoted = line([ten, fifteen, adminOnly], 'cut', {
        client: knownClient({ discountBp: 500 }),
        choice: { 0: choice },
      });
      expect(quoted.discount?.ruleId).toBe(ruleId);
      expect(quoted.discountTotal).toBe(discount);
      // The menu is the same whatever is chosen.
      expect(quoted.eligible.map((item) => item.ruleId)).toEqual(['fifteen', 'ten', null]);
      expect(quoted.ineligible).toEqual([
        { ruleId: 'admin-only', title: 'admin-only', reason: R.WRONG_CHANNEL },
      ]);
    });
  });

  describe('bundles', () => {
    it('SUM bundle: each line by its own discount', () => {
      const rule = promotionRule('promo');
      const quoted = quote([rule], ['cut', 'color'], {}, { bundleId: 'sum-bundle' });
      expect(quoted.lines.map((item) => item.chargedPrice)).toEqual([5400, 8100]);
    });

    it('FIXED bundle: one discount on the package price, split like the price', () => {
      const rule = promotionRule('promo', { value: 1500 });
      const quoted = quote([rule], ['cut', 'color'], {}, { bundleId: 'fixed-bundle' });
      // 120.00 - 15% = 102.00, split 60:90.
      expect(quoted).toMatchObject({ listTotal: 12000, discountTotal: 1800, total: 10200 });
      expect(quoted.lines.map((item) => item.discountTotal)).toEqual([720, 1080]);
      for (const item of quoted.lines) {
        expect(item.chargedPrice).toBe(item.listPrice - item.discountTotal);
        expect(item.discount?.amount).toBe(-item.discountTotal);
        expect(item.eligible[0]).toMatchObject({ ruleId: 'promo', amount: 1800 });
      }
    });

    it('FIXED bundle: rounded down on the package, shares never exceed a line', () => {
      const rule = promotionRule('promo', { valueType: AMOUNT, value: 4000 });
      const quoted = quote([rule], ['cut', 'wash'], {}, { bundleId: 'odd-bundle' });
      // 49.90 - 40.00 = 9.90 -> 9.00.
      expect(quoted).toMatchObject({ listTotal: 4990, discountTotal: 4090, total: 900 });
      expect(quoted.lines.reduce((sum, item) => sum + item.discountTotal, 0)).toBe(4090);
      for (const item of quoted.lines) expect(item.chargedPrice).toBeGreaterThanOrEqual(0);
    });

    it('FIXED bundle: matched only by BUNDLE or all, not by its services', () => {
      const byService = promotionRule('by-service', {
        appliesToAll: false,
        targets: [{ type: PriceRuleTargetType.SERVICE, id: 'cut', excluded: false }],
      });
      const byBundle = promotionRule('by-bundle', {
        appliesToAll: false,
        targets: [{ type: PriceRuleTargetType.BUNDLE, id: 'fixed-bundle', excluded: false }],
      });
      const quoted = quote([byService, byBundle], ['cut', 'color'], {}, { bundleId: 'fixed-bundle' });
      expect(quoted.lines.map((item) => item.discount?.ruleId)).toEqual(['by-bundle', 'by-bundle']);
    });

    it('FIXED bundle: staff limit needs every line staff member', () => {
      const rule = promotionRule('promo', {}, { staffIds: ['anna'] });
      const fixed = book([rule]).quote({
        bundleId: 'fixed-bundle',
        lines: [quoteLine('cut', null, 'anna'), quoteLine('color', null, 'boris')],
        visit: noon,
        context: quoteContext(),
      });
      expect(fixed.discountTotal).toBe(0);
      expect(fixed.lines[0].ineligible[0].reason).toBe(R.WRONG_STAFF);
    });
  });

  describe('promo code', () => {
    const coded = promotionRule('coded', { value: 1000 }, { promoCode: 'AUTUMN' });
    const auto20 = promotionRule('auto20', { value: 2000 });

    it.each([
      ['no code', [coded], null, null, null],
      ['applied', [coded], 'autumn', APPLIED, null],
      ['a better automatic one won', [coded, auto20], 'AUTUMN', BETTER_APPLIED, null],
      ['unknown code', [coded], 'SPRING', NOT_FOUND, null],
      [
        'code of a promotion for other services',
        [promotionRule('coded', {
          appliesToAll: false,
          targets: [{ type: PriceRuleTargetType.SERVICE, id: 'wash', excluded: false }],
        }, { promoCode: 'AUTUMN' })],
        'AUTUMN',
        NOT_APPLICABLE,
        R.NOT_TARGETED,
      ],
      [
        'code for new clients only',
        [promotionRule('coded', {}, { promoCode: 'AUTUMN', clientFilter: PromotionClientFilter.NEW })],
        'AUTUMN',
        NOT_APPLICABLE,
        R.CLIENT_UNKNOWN,
      ],
      [
        'code out of its hours',
        [promotionRule('coded', { intervals: [{ start: 600, end: 660 }] }, { promoCode: 'AUTUMN' })],
        'AUTUMN',
        NOT_APPLICABLE,
        R.OUT_OF_INTERVAL,
      ],
      [
        'code used up',
        [promotionRule('coded', {}, { promoCode: 'AUTUMN', usageLimitTotal: 5 })],
        'AUTUMN',
        NOT_APPLICABLE,
        R.LIMIT_REACHED,
      ],
      [
        'code below its minimum visit total, with the minimum',
        [promotionRule('coded', {}, { promoCode: 'AUTUMN', minVisitTotal: 1_000_000 })],
        'AUTUMN',
        NOT_APPLICABLE,
        R.BELOW_MIN_TOTAL,
      ],
      [
        'code of a disabled promotion',
        [promotionRule('coded', { enabled: false }, { promoCode: 'AUTUMN' })],
        'AUTUMN',
        NOT_APPLICABLE,
        R.DISABLED,
      ],
    ] as const)('%s', (_name, rules, code, status, reason) => {
      const quoted = quote([...rules], ['cut'], {
        promoCode: code,
        usage: { coded: { total: 5, perClient: 0 } },
      });
      expect(quoted.promoCode).toEqual(
        status === null
          ? null
          : {
              code: code?.trim().toUpperCase(),
              status,
              ruleId: status === NOT_FOUND ? null : 'coded',
              reason,
              minVisitTotal: reason === R.BELOW_MIN_TOTAL ? 1_000_000 : null,
            },
      );
    });

    it('APPLIED when the code reaches at least one line', () => {
      const coded = promotionRule('coded', {
        appliesToAll: false,
        targets: [{ type: PriceRuleTargetType.SERVICE, id: 'wash', excluded: false }],
      }, { promoCode: 'AUTUMN' });
      expect(quote([coded], ['cut', 'wash'], { promoCode: 'AUTUMN' }).promoCode?.status).toBe(APPLIED);
    });
  });

  describe('explain', () => {
    it('lists promotions with their kind and reason; a lost one is LESS_BENEFICIAL', () => {
      const plus = surchargeRule('plus', { weekdaysMask: weekdays(6) });
      const ten = promotionRule('ten');
      const fifteen = promotionRule('fifteen', { value: 1500 });
      const fresh = promotionRule('fresh', {}, { clientFilter: PromotionClientFilter.NEW });
      const off = promotionRule('off', { enabled: false });
      const { quote: quoted, notApplied } = book([plus, ten, fifteen, fresh, off]).explain({
        bundleId: null,
        lines: [quoteLine('cut')],
        visit: noon,
        context: quoteContext(),
      });
      expect(quoted.lines[0].discount?.ruleId).toBe('fifteen');
      expect(notApplied).toEqual([
        { ruleId: 'plus', kind: PriceRuleKind.SURCHARGE, name: 'plus', reason: R.WRONG_WEEKDAY },
        { ruleId: 'fresh', kind: PriceRuleKind.PROMOTION, name: 'fresh', reason: R.CLIENT_UNKNOWN },
        { ruleId: 'off', kind: PriceRuleKind.PROMOTION, name: 'off', reason: R.DISABLED },
        { ruleId: 'ten', kind: PriceRuleKind.PROMOTION, name: 'ten', reason: R.LESS_BENEFICIAL },
      ]);
    });

    it('without a context promotions are not listed', () => {
      const { notApplied } = book([promotionRule('ten')]).explain({
        bundleId: null,
        lines: [quoteLine('cut')],
        visit: noon,
      });
      expect(notApplied).toEqual([]);
    });
  });

  describe('price range and "any staff"', () => {
    const morning = promotionRule('morning', { value: 2000, intervals: [{ start: 600, end: 720 }] });

    it('a promotion in part of the day lowers the minimum', () => {
      expect(
        book([morning]).priceRange(
          { bundleId: null, lines: [quoteLine('cut')], context: quoteContext() },
          [MONDAY],
        ),
      ).toEqual({ min: 4800, max: 6000 });
    });

    it('without a context the range has no discounts', () => {
      expect(
        book([morning]).priceRange({ bundleId: null, lines: [quoteLine('cut')] }, [MONDAY]),
      ).toEqual({ min: 6000, max: 6000 });
    });

    it.each([
      ['a promo code', { promoCode: 'X' }],
      ['new clients', { clientFilter: PromotionClientFilter.NEW }],
      ['a lead time', { maxLeadMinutes: 600 }],
      ['a minimum total', { minVisitTotal: 100 }],
      ['the admin channel', { channels: [PromotionChannel.ADMIN] }],
      ['a booking period from tomorrow', { bookingFrom: '2026-11-24' }],
    ] as const)('catalog "from" leaves out a promotion with %s', (_name, conditions) => {
      const rule = promotionRule('promo', {}, { ...conditions } as Partial<PricingPromotionEntry>);
      expect(
        book([rule]).priceRange(
          {
            bundleId: null,
            lines: [quoteLine('cut')],
            context: quoteContext({ catalogFloor: true }),
          },
          [MONDAY],
        ),
      ).toEqual({ min: 6000, max: 6000 });
    });

    it('day segments split at promotion edges with a context', () => {
      const segments = book([morning]).daySegments(
        { bundleId: null, lines: [quoteLine('cut')], context: quoteContext() },
        MONDAY,
      );
      expect(segments.map((item) => [item.startMinute, item.endMinute, item.quote.total])).toEqual([
        [0, 600, 6000],
        [600, 720, 4800],
        [720, 1440, 6000],
      ]);
    });

    it('a staff-limited promotion makes the pricier staff member cheaper', () => {
      // Boris: 80.00 - 50% = 40.00 < Anna 60.00.
      const rule = promotionRule('boris-half', { value: 5000 }, { staffIds: ['boris'] });
      const priced = book([rule]);
      expect(priced.candidatePrice('cut', 'boris', null)).toBe(8000);
      expect(priced.candidatePrice('cut', 'boris', null, noon, quoteContext())).toBe(4000);
      expect(priced.candidatePrice('cut', 'anna', null, noon, quoteContext())).toBe(6000);
    });

    it('is deterministic', () => {
      const rules = [morning, promotionRule('ten'), promotionRule('fifteen', { value: 1500 })];
      const request = {
        bundleId: null,
        lines: [quoteLine('cut'), quoteLine('color')],
        visit: visitAt(MONDAY, '10:30'),
        context: quoteContext({ client: knownClient({ discountBp: 1500 }) }),
      };
      expect(book(rules).quote(request)).toEqual(book([...rules].reverse()).quote(request));
    });
  });
});
