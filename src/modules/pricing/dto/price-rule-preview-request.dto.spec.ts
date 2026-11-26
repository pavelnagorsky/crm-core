import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { exceptionFactory } from '../../../shared/validation/exception-factory.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PriceRulePreviewRequestDto } from './price-rule-preview-request.dto.js';

/** The global pipe of main.ts. */
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  exceptionFactory,
});

const rule = {
  kind: 'PROMOTION',
  scheduleType: 'WEEKLY',
  name: 'Осень',
  valueType: 'PERCENT',
  value: '10.00',
  appliesToAllServices: true,
  publicName: 'Осенняя скидка',
  channels: ['ADMIN'],
};

const transform = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: PriceRulePreviewRequestDto,
  }) as Promise<PriceRulePreviewRequestDto>;

describe('PriceRulePreviewRequestDto', () => {
  it('accepts a rule', async () => {
    const dto = await transform({ rule });
    expect(dto.rule.name).toBe('Осень');
  });

  it.each([
    ['no rule', {}],
    ['rule null', { rule: null }],
    ['rule an array', { rule: [] }],
    ['rule a string', { rule: 'promo' }],
    ['rule without targets flag', { rule: { ...rule, appliesToAllServices: undefined } }],
    ['a target that is not an object', { rule: { ...rule, targets: [null] } }],
  ])('%s: 400 VALIDATION_ERROR', async (_name, body) => {
    const error = await transform(body).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(ErrorCode.VALIDATION_ERROR.code);
    expect((error as AppException).getStatus()).toBe(400);
  });
});
