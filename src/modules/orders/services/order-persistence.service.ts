import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderItemStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { OrderSearchRequestDto } from '../dto/order-search-request.dto.js';
import { OrderSearchOrderBy } from '../enums/order-search-order-by.enum.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { orderInclude } from '../constants/order-include.constant.js';
import { OrderComputeService } from './order-compute.service.js';

@Injectable()
export class OrderPersistenceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly compute: OrderComputeService,
  ) {}

  findById(locationId: string, orderId: string): Promise<OrderWithItems> {
    return this.findExisting({ id: orderId, locationId });
  }

  async search(
    locationId: string,
    dto: OrderSearchRequestDto,
  ): Promise<PaginatedResult<OrderWithItems>> {
    const where: Prisma.OrderWhereInput = {
      locationId,
      status: dto.status,
      clientId: dto.clientId,
      bookingId: dto.bookingId,
      occurredAt:
        dto.from || dto.to
          ? {
              gte: dto.from ? new Date(dto.from) : undefined,
              lte: dto.to ? new Date(dto.to) : undefined,
            }
          : undefined,
    };
    const search = dto.search?.trim();
    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: 'insensitive' } },
        { clientPhone: { contains: search } },
        {
          items: { some: { title: { contains: search, mode: 'insensitive' } } },
        },
        { items: { some: { sku: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const args: Prisma.OrderFindManyArgs = {
      where,
      include: orderInclude,
      orderBy: stableOrderBy(
        { [dto.orderBy ?? OrderSearchOrderBy.OCCURRED_AT]: direction },
        direction,
      ),
    };
    if (!dto.isExport) {
      args.skip = (dto.page - 1) * dto.pageSize;
      args.take = dto.pageSize;
    }
    const [items, totalItems] = await this.db.$transaction([
      this.db.order.findMany(args),
      this.db.order.count({ where }),
    ]);
    return { items: items as OrderWithItems[], totalItems };
  }

  inTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(operation, {
      maxWait: 5_000,
      timeout: 30_000,
    });
  }

  lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<unknown> {
    return tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
    `);
  }

  async findInTransaction(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
  ): Promise<OrderWithItems> {
    const order = await tx.order.findFirst({
      where: { id: orderId, locationId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findByBookingInTransaction(
    tx: Prisma.TransactionClient,
    locationId: string,
    bookingId: string,
  ): Promise<OrderWithItems> {
    const order = await tx.order.findUnique({
      where: { bookingId },
      include: orderInclude,
    });
    if (!order || order.locationId !== locationId) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async refreshTotals(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
  ): Promise<OrderWithItems> {
    const order = await this.findInTransaction(tx, locationId, orderId);
    const totals = this.compute.totals(
      order.items
        .filter((item) => item.status !== OrderItemStatus.REVERSED)
        .map((item) => ({
          listUnitPrice: item.listUnitPrice,
          listLineTotal: item.quantity.mul(item.listUnitPrice),
          customUnitPrice: item.customUnitPrice,
          unitPrice: item.unitPrice,
          lineSubtotal: item.lineSubtotal,
          discountTotal: item.discountTotal,
          lineTotal: item.lineTotal,
        })),
    );
    return tx.order.update({
      where: { id: orderId },
      data: totals,
      include: orderInclude,
    });
  }

  private async findExisting(
    where: Prisma.OrderWhereInput,
  ): Promise<OrderWithItems> {
    const order = await this.db.order.findFirst({
      where,
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}
