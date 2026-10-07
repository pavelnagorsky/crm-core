import {
  AuditActorRole,
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
  ProductStatus,
  ProductUnit,
} from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { OrderComputeService } from './order-compute.service.js';
import { OrdersService } from './orders.service.js';

const owner = { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER };
const employee = { id: 'staff-1', name: 'Staff', role: AuditActorRole.STAFF };

function order(
  status: OrderStatus,
  itemStatus: OrderItemStatus = OrderItemStatus.DRAFT,
) {
  const now = new Date('2026-10-01T10:00:00.000Z');
  return {
    id: 'order-1',
    locationId: 'location-1',
    bookingId: null,
    clientId: null,
    clientName: null,
    clientPhone: null,
    currency: 'BYN',
    status,
    occurredAt: now,
    listTotalAmount: new Prisma.Decimal(20),
    subtotalAmount: new Prisma.Decimal(15),
    discountTotal: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(15),
    note: null,
    createdById: 'owner-1',
    createdByName: 'Owner',
    voidedAt: null,
    voidReason: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'item-1',
        orderId: 'order-1',
        type: OrderItemType.PRODUCT,
        bookingItemId: null,
        status: itemStatus,
        catalogItemId: 'product-1',
        categoryId: null,
        productLocationId: 'product-location-1',
        title: 'Shampoo',
        sku: 'SKU-1',
        unit: ProductUnit.PIECE,
        quantity: new Prisma.Decimal(1),
        listUnitPrice: new Prisma.Decimal(20),
        customUnitPrice: new Prisma.Decimal(15),
        unitPrice: new Prisma.Decimal(15),
        lineSubtotal: new Prisma.Decimal(15),
        discountTotal: new Prisma.Decimal(0),
        lineTotal: new Prisma.Decimal(15),
        unitCostSnapshot: null,
        lineCostSnapshot: null,
        sellerStaffId: null,
        sellerName: null,
        confirmedAt: itemStatus === OrderItemStatus.CONFIRMED ? now : null,
        occurredAt: itemStatus === OrderItemStatus.CONFIRMED ? now : null,
        createdAt: now,
      },
    ],
  };
}

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    orderItem: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const db = {
    order: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const products = { resolveForSale: vi.fn() };
  const inventory = { postSale: vi.fn(), reverseSale: vi.fn() };
  const staff = { resolveForProductSale: vi.fn().mockResolvedValue([]) };
  const earnings = {
    recordForProductOrder: vi.fn(),
    reverseForProductOrder: vi.fn(),
  };
  const clients = { findInBrand: vi.fn() };
  const locations = {
    findById: vi.fn().mockResolvedValue({
      id: 'location-1',
      brandId: 'brand-1',
      currency: 'BYN',
    }),
  };
  const events = { emit: vi.fn() };
  const service = new OrdersService(
    db as never,
    products as never,
    inventory as never,
    staff as never,
    earnings as never,
    clients as never,
    locations as never,
    new OrderComputeService(),
    events as never,
  );
  return {
    service,
    db,
    tx,
    products,
    inventory,
    earnings,
    events,
    locations,
  };
}

function product() {
  return {
    id: 'product-location-1',
    productId: 'product-1',
    locationId: 'location-1',
    retailPrice: new Prisma.Decimal(20),
    status: ProductStatus.ACTIVE,
    trackInventory: true,
    reorderLevel: new Prisma.Decimal(2),
    createdAt: new Date(),
    updatedAt: new Date(),
    product: {
      id: 'product-1',
      brandId: 'brand-1',
      categoryId: null,
      imageFileId: null,
      name: 'Shampoo',
      description: null,
      sku: 'SKU-1',
      barcode: null,
      unit: ProductUnit.PIECE,
      status: ProductStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      category: null,
      imageFile: null,
    },
  };
}

describe('OrdersService', () => {
  it('keeps owner custom price separate from discounts', async () => {
    const { service, db, products } = setup();
    products.resolveForSale.mockResolvedValue([product()]);
    db.order.create.mockResolvedValue(order(OrderStatus.ACTIVE));

    await service.create(
      'location-1',
      {
        items: [
          {
            productId: 'product-1',
            quantity: '1.000',
            customUnitPrice: '15.00',
          },
        ],
      },
      owner,
    );

    const data = db.order.create.mock.calls[0][0].data;
    expect(data.items.create[0]).toEqual(
      expect.objectContaining({
        listUnitPrice: expect.objectContaining({}),
        customUnitPrice: expect.objectContaining({}),
        discountTotal: expect.objectContaining({}),
      }),
    );
    expect(data.subtotalAmount.toFixed(2)).toBe('15.00');
    expect(data.discountTotal.toFixed(2)).toBe('0.00');
    expect(data.totalAmount.toFixed(2)).toBe('15.00');
  });

  it('rejects custom price creation by staff', async () => {
    const { service, db } = setup();

    await expect(
      service.create(
        'location-1',
        {
          items: [
            {
              productId: 'product-1',
              quantity: '1.000',
              customUnitPrice: '15.00',
            },
          ],
        },
        employee,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('preserves an owner custom price when staff replaces an open order', async () => {
    const { service, tx, products } = setup();
    tx.order.findFirst.mockResolvedValue(order(OrderStatus.ACTIVE));
    tx.order.update.mockResolvedValue(order(OrderStatus.ACTIVE));
    products.resolveForSale.mockResolvedValue([product()]);

    await service.update(
      'location-1',
      'order-1',
      {
        items: [{ productId: 'product-1', quantity: '2.000' }],
      },
      employee,
    );

    const item = tx.order.update.mock.calls[0][0].data.items.create[0];
    expect(item.customUnitPrice.toFixed(2)).toBe('15.00');
    expect(item.unitPrice.toFixed(2)).toBe('15.00');
    expect(item.lineTotal.toFixed(2)).toBe('30.00');
  });

  it('makes repeated item confirmation idempotent across stock and payroll', async () => {
    const { service, tx, inventory, earnings, events } = setup();
    tx.order.findFirst.mockResolvedValue(
      order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED),
    );

    const result = await service.confirmItem(
      'location-1',
      'order-1',
      'item-1',
      owner,
    );

    expect(result.items[0].status).toBe(OrderItemStatus.CONFIRMED);
    expect(inventory.postSale).not.toHaveBeenCalled();
    expect(earnings.recordForProductOrder).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('creates confirmed service lines when a booking is completed', async () => {
    const { service, tx } = setup();
    const activeOrder = order(OrderStatus.ACTIVE);
    const orderWithoutItems = {
      ...activeOrder,
      bookingId: 'booking-1',
      items: [],
    };
    const orderWithService = {
      ...activeOrder,
      bookingId: 'booking-1',
      items: [
        {
          ...activeOrder.items[0],
          id: 'service-item-1',
          type: OrderItemType.SERVICE,
          bookingItemId: 'booking-item-1',
          status: OrderItemStatus.CONFIRMED,
          catalogItemId: 'service-1',
          productLocationId: null,
          title: 'Haircut',
          sellerStaffId: 'staff-1',
          sellerName: 'Anna',
        },
      ],
    };
    tx.order.findUnique.mockResolvedValueOnce(orderWithoutItems);
    tx.order.findFirst.mockResolvedValueOnce(orderWithService);
    tx.order.update.mockResolvedValue(orderWithService);

    const result = await service.syncCompletedBooking(
      {
        id: 'booking-1',
        locationId: 'location-1',
        clientId: 'client-1',
        clientFirstName: 'Ann',
        clientLastName: 'Client',
        clientPhone: '+79000000000',
        endAt: new Date('2026-10-01T11:00:00.000Z'),
        items: [
          {
            id: 'booking-item-1',
            serviceId: 'service-1',
            serviceTitle: 'Haircut',
            chargedPrice: new Prisma.Decimal(50),
            customPrice: null,
            staffId: 'staff-1',
            staffName: 'Anna',
            endAt: new Date('2026-10-01T11:00:00.000Z'),
          },
        ],
      } as never,
      owner,
      tx as never,
    );

    expect(tx.order.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingId: 'booking-1' } }),
    );
    expect(tx.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          type: OrderItemType.SERVICE,
          bookingItemId: 'booking-item-1',
          status: OrderItemStatus.CONFIRMED,
        }),
      }),
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: expect.objectContaining({}),
        }),
      }),
    );
    expect(result.items[0].bookingItemId).toBe('booking-item-1');
  });
});
