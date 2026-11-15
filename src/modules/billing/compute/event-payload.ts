import { Prisma, SubscriptionPayment } from '@prisma/client';

/** JSON for SubscriptionEvent.payload: dates as ISO strings, amounts as 2dp strings. */
export class EventPayload {
  private constructor() {}

  static of(values: Record<string, unknown>): Prisma.InputJsonObject {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      result[key] = EventPayload.value(value);
    }
    return result;
  }

  /** The fields every payment event carries. */
  static payment(payment: SubscriptionPayment): Record<string, unknown> {
    return {
      paymentId: payment.id,
      number: payment.number,
      provider: payment.provider,
      planId: payment.planId,
      planName: payment.planName,
      billingPeriod: payment.billingPeriod,
      amount: payment.amount,
      currency: payment.currency,
    };
  }

  private static value(value: unknown): Prisma.InputJsonValue | null {
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (Prisma.Decimal.isDecimal(value))
      return (value as Prisma.Decimal).toFixed(2);
    if (Array.isArray(value)) return value.map((v) => EventPayload.value(v));
    if (typeof value === 'object')
      return EventPayload.of(value as Record<string, unknown>);
    return value as Prisma.InputJsonValue;
  }
}
