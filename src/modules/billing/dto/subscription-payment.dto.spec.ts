import {
  BillingActorRole,
  BillingPeriod,
  Prisma,
  SubscriptionEvent,
  SubscriptionEventType,
  SubscriptionPayment,
  SubscriptionPaymentMethod,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { AdminSubscriptionPaymentDto } from './admin-subscription-payment.dto.js';
import { AdminSubscriptionEventDto } from './admin-subscription-event.dto.js';
import { SubscriptionEventDto } from './subscription-event.dto.js';
import { SubscriptionPaymentDto } from './subscription-payment.dto.js';

const NOW = new Date('2026-06-15T12:00:00Z');

const PAYMENT: SubscriptionPayment = {
  id: 'pay-1',
  number: 123,
  subscriptionId: 'sub-1',
  brandId: 'brand-1',
  planId: 'plan-solo',
  planName: 'Solo',
  billingPeriod: BillingPeriod.MONTH,
  countryCode: 'BY',
  currency: 'BYN',
  amount: new Prisma.Decimal('25'),
  provider: SubscriptionPaymentProvider.OFFLINE,
  status: SubscriptionPaymentStatus.PAID,
  method: SubscriptionPaymentMethod.ERIP,
  externalId: 'ext-1',
  providerData: { raw: 'secret' },
  reference: 'ERIP-1',
  failureReason: null,
  ownerComment: 'please',
  expiresAt: null,
  paidAt: NOW,
  confirmedAt: NOW,
  periodStart: NOW,
  periodEnd: NOW,
  createdById: 'user-1',
  createdByRole: BillingActorRole.OWNER,
  confirmedById: 'admin-1',
  adminNote: 'checked the bank statement',
  createdAt: NOW,
  updatedAt: NOW,
};

describe('SubscriptionPaymentDto', () => {
  it('shows the owner no admin note, provider data or external id', () => {
    const dto = SubscriptionPaymentDto.fromEntity(PAYMENT);

    for (const key of [
      'adminNote',
      'providerData',
      'externalId',
      'confirmedById',
      'createdById',
    ])
      expect(dto).not.toHaveProperty(key);
    expect(dto).toMatchObject({
      id: 'pay-1',
      displayNumber: 'KL-000123',
      amount: '25.00',
      currency: 'BYN',
      reference: 'ERIP-1',
      ownerComment: 'please',
    });
  });

  it('keeps the admin note for the platform admin', () => {
    expect(AdminSubscriptionPaymentDto.fromAdmin(PAYMENT, null)).toMatchObject({
      adminNote: 'checked the bank statement',
    });
  });
});

describe('SubscriptionEventDto', () => {
  const event: SubscriptionEvent = {
    id: 'event-1',
    subscriptionId: 'sub-1',
    brandId: 'brand-1',
    type: SubscriptionEventType.PAYMENT_APPLIED,
    actorId: 'admin-1',
    actorRole: BillingActorRole.ADMIN,
    payload: { paymentId: 'pay-1', amount: '25.00', adminNote: 'internal' },
    createdAt: NOW,
  };

  it('hides the admin note and the actor id from the owner', () => {
    const dto = SubscriptionEventDto.fromEntity(event);

    expect(dto.payload).toEqual({ paymentId: 'pay-1', amount: '25.00' });
    expect(dto).not.toHaveProperty('actorId');
    expect(event.payload).toHaveProperty('adminNote');
  });

  it('keeps the admin note and the actor id for the platform admin', () => {
    const dto = AdminSubscriptionEventDto.fromEntity(event);

    expect(dto).toBeInstanceOf(AdminSubscriptionEventDto);
    expect(dto.payload).toEqual(event.payload);
    expect(dto.actorId).toBe('admin-1');
  });

  it('returns an empty payload when there is none', () => {
    expect(
      SubscriptionEventDto.fromEntity({
        ...event,
        payload: null,
      } as SubscriptionEvent).payload,
    ).toEqual({});
  });
});
