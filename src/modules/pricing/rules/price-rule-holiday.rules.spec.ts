import { PriceScheduleType } from '@prisma/client';
import { priceRuleRecord } from '../testing/price-rule-record.factory.js';
import {
  findHolidayConflict,
  findHolidayConflicts,
  isExclusiveHoliday,
} from './price-rule-holiday.rules.js';

const holiday = (
  id: string,
  dates: string[],
  yearly = false,
  name = `Holiday ${id}`,
) =>
  priceRuleRecord({
    id,
    name,
    scheduleType: PriceScheduleType.HOLIDAYS,
    holidayExclusive: true,
    yearly,
    dates,
  });

describe('findHolidayConflict', () => {
  it('finds nothing when no other rule exists', () => {
    expect(
      findHolidayConflict({ dates: ['2027-03-08'], yearly: false }, []),
    ).toBeNull();
  });

  it('reports the same calendar date with the rule and its date', () => {
    expect(
      findHolidayConflict(
        { dates: ['2026-12-30', '2026-12-31'], yearly: false },
        [holiday('a', ['2026-12-31', '2027-01-01'], false, 'New year')],
      ),
    ).toEqual({ ruleId: 'a', ruleName: 'New year', date: '2026-12-31' });
  });

  it('does not mix the same day of different years when neither repeats', () => {
    expect(
      findHolidayConflict({ dates: ['2027-03-08'], yearly: false }, [
        holiday('a', ['2026-03-08']),
      ]),
    ).toBeNull();
  });

  it('compares month and day when the saved rule repeats every year', () => {
    expect(
      findHolidayConflict({ dates: ['2026-03-08'], yearly: true }, [
        holiday('a', ['2031-03-08']),
      ]),
    ).toMatchObject({ ruleId: 'a', date: '2026-03-08' });
  });

  it('compares month and day when the other rule repeats every year', () => {
    expect(
      findHolidayConflict({ dates: ['2029-03-08'], yearly: false }, [
        holiday('a', ['2026-03-08'], true),
      ]),
    ).toMatchObject({ ruleId: 'a', date: '2029-03-08' });
  });

  it('reports the earliest date of the saved rule', () => {
    expect(
      findHolidayConflict(
        { dates: ['2027-03-08', '2026-12-31'], yearly: false },
        [holiday('a', ['2027-03-08']), holiday('b', ['2026-12-31'])],
      ),
    ).toMatchObject({ ruleId: 'b', date: '2026-12-31' });
  });

  it('finds no conflict on other dates', () => {
    expect(
      findHolidayConflict({ dates: ['2027-05-01'], yearly: true }, [
        holiday('a', ['2027-03-08'], true),
      ]),
    ).toBeNull();
  });
});

describe('isExclusiveHoliday', () => {
  it('needs a holiday rule, the exclusive flag and an enabled rule', () => {
    expect(isExclusiveHoliday(holiday('a', ['2027-03-08']))).toBe(true);
    expect(
      isExclusiveHoliday({ ...holiday('a', ['2027-03-08']), enabled: false }),
    ).toBe(false);
    expect(
      isExclusiveHoliday({
        ...holiday('a', ['2027-03-08']),
        holidayExclusive: false,
      }),
    ).toBe(false);
    expect(
      isExclusiveHoliday(priceRuleRecord({ holidayExclusive: true })),
    ).toBe(false);
  });
});

describe('findHolidayConflicts', () => {
  it('lists every other rule once with the first date it claims', () => {
    const conflicts = findHolidayConflicts(
      { dates: ['2027-01-01', '2027-03-08'], yearly: false },
      [
        holiday('a', ['2027-03-08', '2027-01-01']),
        holiday('b', ['2027-03-08']),
        holiday('c', ['2027-05-01']),
      ],
    );
    expect(conflicts).toEqual([
      { ruleId: 'a', ruleName: 'Holiday a', date: '2027-01-01' },
      { ruleId: 'b', ruleName: 'Holiday b', date: '2027-03-08' },
    ]);
  });
});
