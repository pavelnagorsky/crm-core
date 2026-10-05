import { BookingExecutionMode, Prisma } from '@prisma/client';
import { MoneyService } from '../../shared/money/money.service.js';

export class BundleMetrics {
  static price(bundle: {
    fixedPrice: Prisma.Decimal | null;
    items: Array<{ service: { price: Prisma.Decimal } }>;
  }): Prisma.Decimal {
    return bundle.fixedPrice ?? bundle.items.reduce(
      (sum, item) => sum.plus(item.service.price),
      MoneyService.decimal(0),
    );
  }

  static durationMinutes(bundle: {
    executionMode: string;
    items: Array<{ service: { durationMinutes: number; bufferMinutes: number } }>;
  }): number {
    if (bundle.executionMode === BookingExecutionMode.PARALLEL) {
      return Math.max(
        ...bundle.items.map((item) => item.service.durationMinutes + item.service.bufferMinutes),
        0,
      );
    }
    return bundle.items.reduce(
      (sum, item) => sum + item.service.durationMinutes + item.service.bufferMinutes,
      0,
    );
  }
}
