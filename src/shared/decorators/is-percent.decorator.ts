import { IsOptional, Matches } from 'class-validator';
import regularExpressions from '../regular-expressions.js';
import { CanonicalAmount } from '../transforms/canonical-amount.transform.js';
import { ApiPercent } from './api-decimal.decorator.js';

const percentMatchMessage = (key: string | symbol) =>
  `${String(key)} must be a number from 0 to 100 with at most 2 decimal places`;

export const IsPercent = (): PropertyDecorator => (target, propertyKey) => {
  ApiPercent()(target, propertyKey);
  CanonicalAmount()(target, propertyKey);
  Matches(regularExpressions.percent, {
    message: percentMatchMessage(propertyKey),
  })(target, propertyKey);
};

export const IsOptionalPercent =
  (): PropertyDecorator => (target, propertyKey) => {
    ApiPercent({ required: false, nullable: true })(target, propertyKey);
    IsOptional()(target, propertyKey);
    CanonicalAmount()(target, propertyKey);
    Matches(regularExpressions.percent, {
      message: percentMatchMessage(propertyKey),
    })(target, propertyKey);
  };
