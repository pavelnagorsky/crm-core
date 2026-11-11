import { IsDateString, Matches } from 'class-validator';
import regularExpressions from '../../regular-expressions.js';

/** A real calendar day as "YYYY-MM-DD", without time or offset. */
export function IsCalendarDate(): PropertyDecorator {
  return (target, propertyKey) => {
    IsDateString({ strict: true })(target, propertyKey);
    Matches(regularExpressions.calendarDate, {
      message: '$property must be a calendar date, e.g. 2026-11-11',
    })(target, propertyKey);
  };
}
