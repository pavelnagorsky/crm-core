import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PriceRuleIntervalInputDto } from './price-rule-interval-input.dto.js';

const errorsOf = (start: string, end: string) =>
  validateSync(plainToInstance(PriceRuleIntervalInputDto, { start, end })).map(
    (error) => error.property,
  );

describe('PriceRuleIntervalInputDto', () => {
  it.each([
    ['17:00', '21:00'],
    ['00:00', '24:00'],
    ['09:30', '23:59'],
  ])('accepts %s-%s', (start, end) => {
    expect(errorsOf(start, end)).toEqual([]);
  });

  it.each([
    ['17:00', '24:30', 'end'],
    ['17:00', '25:00', 'end'],
    ['24:00', '24:00', 'start'],
    ['7:00', '21:00', 'start'],
    ['17:00', '2100', 'end'],
  ])('rejects %s-%s on %s', (start, end, property) => {
    expect(errorsOf(start, end)).toEqual([property]);
  });
});
