import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { stableOrderBy } from '../../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { PaginatedResult } from '../../../../shared/interfaces/paginated-result.interface.js';
import { PaymentReference } from '../../compute/payment-reference.js';
import { AdminSubscriptionPaymentsRequestDto } from '../../dto/admin-subscription-payments-request.dto.js';
import { SubscriptionPaymentsRequestDto } from '../../dto/subscription-payments-request.dto.js';
import { SubscriptionPaymentOrderBy } from '../../enums/subscription-payment-order-by.enum.js';

type Tx = Prisma.TransactionClient;

/**
 * Owns SubscriptionPayment reads. Changes: PaymentRequestService (requests),
 * PaymentConfirmationService (provider confirmation), ManualPaymentService (admin).
 */
@Injectable()
export class SubscriptionPaymentService {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<SubscriptionPayment> {
    const payment = await this.db.subscriptionPayment.findUnique({
      where: { id },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /** A payment of this brand only; another brand's id is "not found". */
  async findForBrand(
    brandId: string,
    id: string,
  ): Promise<SubscriptionPayment> {
    const payment = await this.db.subscriptionPayment.findFirst({
      where: { id, brandId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  findPendingByBrand(
    brandId: string,
    tx: Tx = this.db,
  ): Promise<SubscriptionPayment | null> {
    return tx.subscriptionPayment.findFirst({
      where: { brandId, status: SubscriptionPaymentStatus.PENDING },
    });
  }

  /** Brands with an open request, from the given ones. */
  async findBrandIdsWithPending(brandIds?: string[]): Promise<Set<string>> {
    const rows = await this.db.subscriptionPayment.findMany({
      where: {
        status: SubscriptionPaymentStatus.PENDING,
        ...(brandIds ? { brandId: { in: brandIds } } : {}),
      },
      select: { brandId: true },
    });
    return new Set(rows.map((r) => r.brandId));
  }

  findRecentForBrand(
    brandId: string,
    take: number,
  ): Promise<SubscriptionPayment[]> {
    return this.db.subscriptionPayment.findMany({
      where: { brandId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  searchForBrand(
    brandId: string,
    dto: SubscriptionPaymentsRequestDto,
  ): Promise<PaginatedResult<SubscriptionPayment>> {
    return this.page({ brandId }, dto);
  }

  searchAdmin(
    dto: AdminSubscriptionPaymentsRequestDto,
  ): Promise<PaginatedResult<SubscriptionPayment>> {
    const where: Prisma.SubscriptionPaymentWhereInput = {
      status: dto.status?.length ? { in: dto.status } : undefined,
      provider: dto.provider?.length ? { in: dto.provider } : undefined,
      brandId: dto.brandId,
    };
    if (dto.createdFrom || dto.createdTo)
      where.createdAt = {
        gte: dto.createdFrom ? new Date(dto.createdFrom) : undefined,
        lt: dto.createdTo ? new Date(dto.createdTo) : undefined,
      };
    if (dto.search) {
      const number = PaymentReference.parse(dto.search);
      if (number === null) return Promise.resolve({ items: [], totalItems: 0 });
      where.number = number;
    }
    return this.page(where, dto);
  }

  private async page(
    where: Prisma.SubscriptionPaymentWhereInput,
    dto: SubscriptionPaymentsRequestDto,
  ): Promise<PaginatedResult<SubscriptionPayment>> {
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy: Prisma.SubscriptionPaymentOrderByWithRelationInput =
      dto.orderBy === SubscriptionPaymentOrderBy.PAID_AT
        ? { paidAt: { sort: direction, nulls: 'last' } }
        : { [dto.orderBy ?? SubscriptionPaymentOrderBy.CREATED_AT]: direction };
    const [items, totalItems] = await this.db.$transaction([
      this.db.subscriptionPayment.findMany({
        where,
        orderBy: stableOrderBy(orderBy, direction),
        skip: dto.isExport ? undefined : (dto.page - 1) * dto.pageSize,
        take: dto.isExport ? undefined : dto.pageSize,
      }),
      this.db.subscriptionPayment.count({ where }),
    ]);
    return { items, totalItems };
  }
}
