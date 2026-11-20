import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaymentInputDto } from '../dto/payment-input.dto.js';
import { RefundInputDto } from '../dto/refund-input.dto.js';
import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';
import { PaymentMethod } from '../enums/payment-method.enum.js';

async function keyErrors(dto: object): Promise<string[]> {
  const errors = await validate(dto as object);
  return errors
    .filter((error) => error.property === 'idempotencyKey')
    .flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('IsClientPaymentKey', () => {
  it.each(['order-sale:x', 'order-confirm:x', ' order-return:x'])(
    'reserves %s for nested payments',
    async (idempotencyKey) => {
      const payment = plainToInstance(PaymentInputDto, {
        method: PaymentInputMethod.CASH,
        idempotencyKey,
      });
      const refund = plainToInstance(RefundInputDto, {
        method: PaymentMethod.CASH,
        amount: '1.00',
        idempotencyKey,
      });
      expect(await keyErrors(payment)).not.toEqual([]);
      expect(await keyErrors(refund)).not.toEqual([]);
    },
  );

  it.each(['6c0f2a', 'order-saleX', 'my-order-sale:x', 'ORDER-SALE:x'])(
    'accepts %s',
    async (idempotencyKey) => {
      const payment = plainToInstance(PaymentInputDto, {
        method: PaymentInputMethod.CASH,
        idempotencyKey,
      });
      expect(await keyErrors(payment)).toEqual([]);
    },
  );
});
