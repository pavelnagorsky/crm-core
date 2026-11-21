import { ForbiddenException } from '@nestjs/common';
import { PaymentMethod, PaymentType, Prisma } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';
import { PaymentCommand } from '../interfaces/payment-command.interface.js';
import { PaymentLedgerService } from './payment-ledger.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const actor = { id: 'user-1', name: 'Anna', role: AuditActorRole.OWNER };

function record(type: PaymentType, amount: string, operationId: string) {
  return {
    id: `${operationId}-record`,
    operationId,
    type,
    method: PaymentMethod.CARD,
    amount: d(amount),
    voidedAt: null,
  };
}

function setup(active: ReturnType<typeof record>[]) {
  const tx = {
    payment: {
      findMany: vi.fn().mockResolvedValue(active),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    paymentOperation: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'op-paid',
        payments: [{ occurredAt: new Date() }],
      }),
      create: vi.fn(async ({ data }) => ({ id: 'op-new', ...data, payments: [] })),
      findFirst: vi.fn(),
    },
  };
  return { tx, ledger: new PaymentLedgerService() };
}

function command(overrides: Partial<PaymentCommand> = {}): PaymentCommand {
  return {
    locationId: 'location-1',
    orderId: 'order-1',
    currency: 'BYN',
    amountDue: d('1500'),
    request: {
      method: PaymentInputMethod.CARD,
      cashAmount: null,
      cardAmount: null,
      occurredAt: null,
      expectedAmount: null,
      expectNoPayment: false,
    },
    defaultOccurredAt: new Date(),
    idempotencyKey: 'key-1',
    requestHash: 'hash',
    actor,
    canReplace: false,
    ...overrides,
  };
}

const expecting = (
  expectations: Partial<PaymentCommand['request']>,
  overrides: Partial<PaymentCommand> = {},
) =>
  command({
    ...overrides,
    request: { ...command().request, ...expectations },
  });

describe('PaymentLedgerService.record check order', () => {
  const paid = record(PaymentType.PAYMENT, '1500', 'op-paid');

  it('answers 409 PAYMENT_ALREADY_RECORDED before the 403 of a replacement', async () => {
    const { tx, ledger } = setup([paid]);
    await expect(
      ledger.record(tx as never, expecting({ expectNoPayment: true })),
    ).rejects.toMatchObject({
      errorCode: 'PAYMENT_ALREADY_RECORDED',
      status: 409,
      payload: { operationId: 'op-paid' },
    });
    expect(tx.paymentOperation.create).not.toHaveBeenCalled();
  });

  it('still refuses a replacement without order:write: 403', async () => {
    const { tx, ledger } = setup([paid]);
    await expect(ledger.record(tx as never, command())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('compares the shown amount with the amount due plus active refunds', async () => {
    const refund = record(PaymentType.REFUND, '500', 'op-refund');
    const { tx, ledger } = setup([paid, refund]);
    await expect(
      ledger.record(
        tx as never,
        expecting({ expectedAmount: d('1500') }, { canReplace: true }),
      ),
    ).rejects.toMatchObject({
      errorCode: 'PAYMENT_AMOUNT_MISMATCH',
      payload: { amountDue: '1500.00', requiredAmount: '2000.00' },
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    await expect(
      ledger.record(
        tx as never,
        expecting({ expectedAmount: d('2000') }, { canReplace: true }),
      ),
    ).resolves.toMatchObject({ operation: { id: 'op-new' } });
  });

  it('answers PAYMENT_NOTHING_DUE before checking the shown amount', async () => {
    const { tx, ledger } = setup([]);
    await expect(
      ledger.record(
        tx as never,
        expecting({ expectedAmount: d('100') }, { amountDue: d('0') }),
      ),
    ).rejects.toMatchObject({ errorCode: 'PAYMENT_NOTHING_DUE' });
  });

  it('records a first one-click payment with the shown amount', async () => {
    const { tx, ledger } = setup([]);
    const change = await ledger.record(
      tx as never,
      expecting({ expectedAmount: d('1500'), expectNoPayment: true }),
    );
    expect(change.operation.id).toBe('op-new');
    expect(tx.paymentOperation.create).toHaveBeenCalledOnce();
  });
});

describe('PaymentLedgerService.undo', () => {
  const now = new Date('2026-11-21T10:05:00.000Z');
  const operation = (voidedAt: Date | null) => ({
    id: 'op-1',
    type: PaymentType.PAYMENT,
    replacesOperationId: null,
    createdById: 'user-1',
    createdAt: new Date('2026-11-21T10:00:00.000Z'),
    orderReturnId: null,
    payments: [{ id: 'r-1', voidedAt }],
  });
  const undo = {
    locationId: 'location-1',
    orderId: 'order-1',
    operationId: 'op-1',
    actor,
    now,
  };

  it('answers 404 PAYMENT_OPERATION_NOT_FOUND for an operation of another order', async () => {
    const { tx, ledger } = setup([]);
    tx.paymentOperation.findFirst.mockResolvedValue(null);
    await expect(
      ledger.undo(tx as never, undo, 'BYN'),
    ).rejects.toMatchObject({ errorCode: 'PAYMENT_OPERATION_NOT_FOUND' });
  });

  it('changes nothing for an operation voided already', async () => {
    const { tx, ledger } = setup([]);
    tx.paymentOperation.findFirst.mockResolvedValue(operation(new Date()));
    await expect(ledger.undo(tx as never, undo, 'BYN')).resolves.toBeNull();
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('voids the records with the undo reason', async () => {
    const { tx, ledger } = setup([]);
    tx.paymentOperation.findFirst.mockResolvedValue(operation(null));
    tx.payment.count.mockResolvedValue(0);
    const change = await ledger.undo(tx as never, undo, 'BYN');
    expect(change).toMatchObject({
      kind: 'VOIDED',
      reason: 'Отменено сразу после записи',
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { operationId: 'op-1', voidedAt: null },
      }),
    );
  });
});
