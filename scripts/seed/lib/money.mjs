import { Prisma } from '@prisma/client';

// Mirrors src/shared/money/money.service.ts + earning-calculator.service.ts.
// Amounts are quantized half-up to 2 decimal places once, when they become stored values.

const SCALE = 2;

export function decimal(value) {
  return new Prisma.Decimal(value ?? 0);
}

/** Half-up to currency scale. */
export function quantize(value) {
  return decimal(value).toDecimalPlaces(SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/** commission = quantize(base * percent / 100). */
export function commission(base, percent) {
  return quantize(decimal(base).mul(decimal(percent)).div(100));
}

/** hourly = quantize(hours * rate). */
export function hourly(hours, rate) {
  return quantize(decimal(hours).mul(decimal(rate)));
}

/** Unquantized daily share of a monthly salary (quantize the month sum once). */
export function dailySalaryShare(monthlySalary, daysInMonth) {
  if (daysInMonth <= 0) return decimal(0);
  return decimal(monthlySalary).div(daysInMonth);
}

/** Guaranteed-minimum top-up. Zero when work earnings already cover the salary. */
export function guaranteedTopUp(salary, alreadyEarned) {
  const diff = decimal(salary).minus(decimal(alreadyEarned));
  return diff.gt(0) ? quantize(diff) : decimal(0);
}

/** Exact hours between two minute-of-day values (no quantize). */
export function hoursFromShift(startMinutes, endMinutes) {
  let minutes = endMinutes - startMinutes;
  if (minutes < 0) minutes += 24 * 60;
  if (minutes <= 0) return decimal(0);
  return decimal(minutes).div(60);
}

export function format(value) {
  return decimal(value).toFixed(SCALE);
}
