import {
  AuditActorRole,
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
  ProductStatus,
  ProductUnit,
} from '@prisma/client';
import { createHash } from 'crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { OrderTargetStatus } from './enums/order-target-status.enum.js';
import { OrdersService } from './orders.service.js';
import { OrderBookingSyncService } from './services/order-booking-sync.service.js';
import { OrderComputeService } from './services/order-compute.service.js';
import { OrderDraftService } from './services/order-draft.service.js';
import { OrderPersistenceService } from './services/order-persistence.service.js';
import { OrderProductTransitionService } from './services/order-product-transition.service.js';

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
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    orderItem: {
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orderOperation: {
      create: vi.fn(),
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
    orderOperation: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const products = { resolveForSale: vi.fn() };
  const inventory = {
    postSale: vi.fn(),
    reverseSale: vi.fn(),
    reverseSaleItem: vi.fn(),
  };
  const staff = { resolveForProductSale: vi.fn().mockResolvedValue([]) };
  const earnings = {
    recordForProductOrder: vi.fn(),
    reverseForProductOrder: vi.fn(),
    reverseForProductOrderItem: vi.fn(),
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
  const compute = new OrderComputeService();
  const persistence = new OrderPersistenceService(db as never, compute);
  const drafts = new OrderDraftService(
    products as never,
    staff as never,
    clients as never,
    locations as never,
    compute,
  );
  const bookingSync = new OrderBookingSyncService(
    locations as never,
    compute,
    drafts,
    persistence,
  );
  const transitions = new OrderProductTransitionService(
    db as never,
    products as never,
    inventory as never,
    staff as never,
    earnings as never,
    persistence,
  );
  const service = new OrdersService(
    db as never,
    locations as never,
    drafts,
    bookingSync,
    persistence,
    transitions,
    events as never,
  );
  return {
    service,
    db,
    tx,
    products,
    inventory,
    staff,
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

function secondProduct() {
  return {
    ...product(),
    id: 'product-location-2',
    productId: 'product-2',
    retailPrice: new Prisma.Decimal(30),
    product: {
      ...product().product,
      id: 'product-2',
      name: 'Conditioner',
      sku: 'SKU-2',
    },
  };
}

function confirmItemsHash(
  locationId: string,
  orderId: string,
  itemIds: string[],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        locationId,
        orderId,
        itemIds: [...itemIds].sort(),
      }),
    )
    .digest('hex');
}

function bookingWithService(
  price: string,
  staffId = 'staff-1',
  staffName = 'Anna',
) {
  return {
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
        chargedPrice: new Prisma.Decimal('1500.00'),
        customPrice: price === '1500.00' ? null : new Prisma.Decimal(price),
        staffId,
        staffName,
        endAt: new Date('2026-10-01T11:00:00.000Z'),
      },
    ],
  } as never;
}

function attachStatefulBookingOrder(tx: ReturnType<typeof setup>['tx']) {
  const base = order(OrderStatus.ACTIVE);
  const state = {
    order: {
      ...base,
      bookingId: 'booking-1',
      listTotalAmount: new Prisma.Decimal(0),
      subtotalAmount: new Prisma.Decimal(0),
      discountTotal: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(0),
      items: [],
    },
    sequence: 0,
  };
  const decimal = (value: unknown) => new Prisma.Decimal(String(value));
  tx.order.upsert.mockResolvedValue(undefined);
  tx.order.findUnique.mockImplementation(() => Promise.resolve(state.order));
  tx.order.findFirst.mockImplementation(() => Promise.resolve(state.order));
  tx.order.update.mockImplementation(({ data }) => {
    state.order = { ...state.order, ...data, items: state.order.items };
    return Promise.resolve(state.order);
  });
  tx.orderItem.create.mockImplementation(({ data }) => {
    state.sequence += 1;
    const row = {
      ...base.items[0],
      id: `service-item-${state.sequence}`,
      orderId: data.orderId,
      type: data.type,
      bookingItemId: data.bookingItemId ?? null,
      status: data.status,
      catalogItemId: data.catalogItemId ?? null,
      categoryId: null,
      productLocationId: null,
      title: data.title,
      sku: null,
      unit: null,
      quantity: decimal(data.quantity),
      listUnitPrice: decimal(data.listUnitPrice),
      customUnitPrice:
        data.customUnitPrice == null ? null : decimal(data.customUnitPrice),
      unitPrice: decimal(data.unitPrice),
      lineSubtotal: decimal(data.lineSubtotal),
      discountTotal: decimal(data.discountTotal ?? 0),
      lineTotal: decimal(data.lineTotal),
      unitCostSnapshot: null,
      lineCostSnapshot: null,
      sellerStaffId: data.sellerStaffId ?? null,
      sellerName: data.sellerName ?? null,
      confirmedAt: data.confirmedAt ?? null,
      occurredAt: data.occurredAt ?? null,
      createdAt: new Date(`2026-10-01T10:00:0${state.sequence}.000Z`),
    };
    state.order.items.push(row);
    return Promise.resolve(row);
  });
  tx.orderItem.updateMany.mockImplementation(({ where, data }) => {
    let count = 0;
    const ids = where.id?.in ? new Set(where.id.in) : null;
    for (const item of state.order.items) {
      const matches =
        ids?.has(item.id) ??
        (item.orderId === where.orderId &&
          item.type === where.type &&
          item.status === where.status);
      if (!matches) continue;
      Object.assign(item, data);
      count += 1;
    }
    return Promise.resolve({ count });
  });
  return state;
}

describe('OrdersService', () => {
  it('keeps owner custom price separate from discounts', async () => {
    const { service, db, products, inventory, earnings } = setup();
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
    expect(inventory.postSale).not.toHaveBeenCalled();
    expect(earnings.recordForProductOrder).not.toHaveBeenCalled();
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

  it('creates and confirms a multi-item product sale atomically', async () => {
    const { service, tx, products, staff, inventory, earnings, events } =
      setup();
    const now = new Date('2026-10-01T10:00:00.000Z');
    const base = order(OrderStatus.ACTIVE);
    const draftOrder = {
      ...base,
      idempotencyKey: 'sale-key-1',
      totalAmount: new Prisma.Decimal(70),
      occurredAt: now,
      items: [
        {
          ...base.items[0],
          id: 'item-1',
          status: OrderItemStatus.DRAFT,
          catalogItemId: 'product-1',
          productLocationId: 'product-location-1',
          title: 'Shampoo',
          sku: 'SKU-1',
          quantity: new Prisma.Decimal(2),
          listUnitPrice: new Prisma.Decimal(20),
          customUnitPrice: null,
          unitPrice: new Prisma.Decimal(20),
          lineSubtotal: new Prisma.Decimal(40),
          lineTotal: new Prisma.Decimal(40),
          sellerStaffId: 'staff-1',
          sellerName: 'Seller',
        },
        {
          ...base.items[0],
          id: 'item-2',
          status: OrderItemStatus.DRAFT,
          catalogItemId: 'product-2',
          productLocationId: 'product-location-2',
          title: 'Conditioner',
          sku: 'SKU-2',
          quantity: new Prisma.Decimal(1),
          listUnitPrice: new Prisma.Decimal(30),
          customUnitPrice: null,
          unitPrice: new Prisma.Decimal(30),
          lineSubtotal: new Prisma.Decimal(30),
          lineTotal: new Prisma.Decimal(30),
          sellerStaffId: null,
          sellerName: null,
        },
      ],
    };
    const confirmedOrder = {
      ...draftOrder,
      items: draftOrder.items.map((item) => ({
        ...item,
        status: OrderItemStatus.CONFIRMED,
        confirmedAt: now,
        occurredAt: now,
      })),
    };
    products.resolveForSale.mockResolvedValue([product(), secondProduct()]);
    staff.resolveForProductSale.mockResolvedValue([
      { id: 'staff-1', name: 'Seller' },
    ]);
    tx.order.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(draftOrder)
      .mockResolvedValueOnce(confirmedOrder);
    tx.order.upsert.mockResolvedValue(draftOrder);
    inventory.postSale.mockResolvedValue([
      {
        orderItemId: 'item-1',
        unitCost: new Prisma.Decimal(5),
        lineCost: new Prisma.Decimal(10),
      },
      {
        orderItemId: 'item-2',
        unitCost: null,
        lineCost: null,
      },
    ]);
    earnings.recordForProductOrder.mockResolvedValue([]);

    const result = await service.create(
      'location-1',
      {
        confirmImmediately: true,
        idempotencyKey: 'sale-key-1',
        items: [
          {
            productId: 'product-1',
            quantity: '2.000',
            sellerStaffId: 'staff-1',
          },
          { productId: 'product-2', quantity: '1.000' },
        ],
      },
      owner,
    );

    expect(result.items.map((item) => item.status)).toEqual([
      OrderItemStatus.CONFIRMED,
      OrderItemStatus.CONFIRMED,
    ]);
    expect(tx.order.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          locationId_idempotencyKey: {
            locationId: 'location-1',
            idempotencyKey: 'sale-key-1',
          },
        },
      }),
    );
    expect(inventory.postSale).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      now,
      expect.arrayContaining([
        expect.objectContaining({
          orderItemId: 'item-1',
          quantity: '2',
          trackInventory: true,
        }),
        expect.objectContaining({
          orderItemId: 'item-2',
          quantity: '1',
        }),
      ]),
      tx,
    );
    expect(earnings.recordForProductOrder).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      now,
      'BYN',
      [
        {
          orderItemId: 'item-1',
          staffId: 'staff-1',
          amount: expect.objectContaining({}),
          description: 'Shampoo',
        },
      ],
      tx,
    );
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['item-1', 'item-2'] } },
      data: {
        status: OrderItemStatus.CONFIRMED,
        confirmedAt: now,
        occurredAt: now,
      },
    });
    expect(events.emit).toHaveBeenCalled();
  });

  it('returns an existing confirmed sale on idempotent retry', async () => {
    const { service, tx, products, inventory, earnings, events } = setup();
    const existing = {
      ...order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED),
      idempotencyKey: 'sale-key-1',
    };
    tx.order.findFirst.mockResolvedValueOnce(existing);

    const result = await service.create(
      'location-1',
      {
        confirmImmediately: true,
        idempotencyKey: 'sale-key-1',
        items: [{ productId: 'product-1', quantity: '1.000' }],
      },
      owner,
    );

    expect(result).toBe(existing);
    expect(products.resolveForSale).not.toHaveBeenCalled();
    expect(tx.order.upsert).not.toHaveBeenCalled();
    expect(inventory.postSale).not.toHaveBeenCalled();
    expect(earnings.recordForProductOrder).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('requires an idempotency key for immediate product sales', async () => {
    const { service, tx } = setup();

    await expect(
      service.create(
        'location-1',
        {
          confirmImmediately: true,
          items: [{ productId: 'product-1', quantity: '1.000' }],
        },
        owner,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.order.upsert).not.toHaveBeenCalled();
  });

  it('does not confirm any item when immediate sale stock posting fails', async () => {
    const { service, tx, products, inventory, earnings } = setup();
    const draftOrder = {
      ...order(OrderStatus.ACTIVE),
      idempotencyKey: 'sale-key-1',
      items: [
        {
          ...order(OrderStatus.ACTIVE).items[0],
          id: 'item-1',
          status: OrderItemStatus.DRAFT,
          catalogItemId: 'product-1',
          productLocationId: 'product-location-1',
        },
      ],
    };
    products.resolveForSale.mockResolvedValue([product()]);
    tx.order.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(draftOrder);
    tx.order.upsert.mockResolvedValue(draftOrder);
    inventory.postSale.mockRejectedValue(new Error('insufficient stock'));

    await expect(
      service.create(
        'location-1',
        {
          confirmImmediately: true,
          idempotencyKey: 'sale-key-1',
          items: [{ productId: 'product-1', quantity: '1.000' }],
        },
        owner,
      ),
    ).rejects.toThrow('insufficient stock');

    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
    expect(earnings.recordForProductOrder).not.toHaveBeenCalled();
  });

  it('rejects voiding an order linked to a booking', async () => {
    const { service, tx, inventory, earnings, events } = setup();
    tx.order.findFirst.mockResolvedValue({
      ...order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED),
      bookingId: 'booking-1',
    });

    const error = await service
      .changeStatus(
        'location-1',
        'order-1',
        OrderTargetStatus.VOIDED,
        'wrong order',
        owner,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ORDER_LINKED_BOOKING_VOID_NOT_ALLOWED',
    );
    expect(earnings.reverseForProductOrder).not.toHaveBeenCalled();
    expect(inventory.reverseSale).not.toHaveBeenCalled();
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
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

  it('prices product items for previews without writing an order', async () => {
    const { service, db, products } = setup();
    products.resolveForSale.mockResolvedValue([product()]);

    const result = await service.priceProductItems('location-1', [
      {
        productId: 'product-1',
        quantity: '2.000',
        customUnitPrice: '12.00',
      },
    ]);

    expect(result[0].type).toBe(OrderItemType.PRODUCT);
    expect(result[0].catalogItemId).toBe('product-1');
    expect(result[0].listLineTotal.toFixed(2)).toBe('40.00');
    expect(result[0].lineTotal.toFixed(2)).toBe('24.00');
    expect(db.order.create).not.toHaveBeenCalled();
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

  it('rejects blank group confirmation idempotency keys', async () => {
    const { service, locations, db } = setup();

    await expect(
      service.confirmItems(
        'location-1',
        'order-1',
        { itemIds: ['item-1'], idempotencyKey: '   ' },
        owner,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(locations.findById).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('confirms multiple draft product items atomically', async () => {
    const { service, tx, products, staff, inventory, earnings, events } =
      setup();
    const active = order(OrderStatus.ACTIVE);
    const draftOrder = {
      ...active,
      items: [
        {
          ...active.items[0],
          id: 'item-1',
          catalogItemId: 'product-1',
          productLocationId: 'product-location-1',
          sellerStaffId: 'staff-1',
          sellerName: 'Seller',
        },
        {
          ...active.items[0],
          id: 'item-2',
          catalogItemId: 'product-2',
          productLocationId: 'product-location-2',
          title: 'Conditioner',
          sku: 'SKU-2',
          listUnitPrice: new Prisma.Decimal(30),
          unitPrice: new Prisma.Decimal(30),
          lineSubtotal: new Prisma.Decimal(30),
          lineTotal: new Prisma.Decimal(30),
          customUnitPrice: null,
          sellerStaffId: null,
          sellerName: null,
        },
      ],
    };
    const confirmedOrder = {
      ...draftOrder,
      items: draftOrder.items.map((item) => ({
        ...item,
        status: OrderItemStatus.CONFIRMED,
      })),
    };
    tx.order.findFirst
      .mockResolvedValueOnce(draftOrder)
      .mockResolvedValueOnce(confirmedOrder);
    products.resolveForSale.mockResolvedValue([product(), secondProduct()]);
    staff.resolveForProductSale.mockResolvedValue([
      { id: 'staff-1', name: 'Seller' },
    ]);
    inventory.postSale.mockResolvedValue([
      {
        orderItemId: 'item-1',
        unitCost: new Prisma.Decimal(5),
        lineCost: new Prisma.Decimal(5),
      },
      {
        orderItemId: 'item-2',
        unitCost: null,
        lineCost: null,
      },
    ]);
    earnings.recordForProductOrder.mockResolvedValue([]);

    const result = await service.confirmItems(
      'location-1',
      'order-1',
      { itemIds: ['item-1', 'item-2'], idempotencyKey: 'confirm-key-1' },
      owner,
    );

    expect(result.items.map((item) => item.status)).toEqual([
      OrderItemStatus.CONFIRMED,
      OrderItemStatus.CONFIRMED,
    ]);
    expect(tx.orderOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        locationId: 'location-1',
        orderId: 'order-1',
        idempotencyKey: 'confirm-key-1',
      }),
    });
    expect(inventory.postSale).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      expect.any(Date),
      expect.arrayContaining([
        expect.objectContaining({ orderItemId: 'item-1' }),
        expect.objectContaining({ orderItemId: 'item-2' }),
      ]),
      tx,
    );
    expect(earnings.recordForProductOrder).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      expect.any(Date),
      'BYN',
      [
        {
          orderItemId: 'item-1',
          staffId: 'staff-1',
          amount: draftOrder.items[0].lineTotal,
          description: 'Shampoo',
        },
      ],
      tx,
    );
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['item-1', 'item-2'] } },
        data: expect.objectContaining({ status: OrderItemStatus.CONFIRMED }),
      }),
    );
    expect(events.emit).toHaveBeenCalled();
  });

  it('confirms only selected draft products and leaves the rest untouched', async () => {
    const { service, tx, products, inventory, earnings } = setup();
    const active = order(OrderStatus.ACTIVE);
    const draftOrder = {
      ...active,
      items: [
        { ...active.items[0], id: 'item-1', catalogItemId: 'product-1' },
        {
          ...active.items[0],
          id: 'item-2',
          catalogItemId: 'product-2',
          productLocationId: 'product-location-2',
        },
      ],
    };
    tx.order.findFirst.mockResolvedValueOnce(draftOrder).mockResolvedValueOnce({
      ...draftOrder,
      items: [
        { ...draftOrder.items[0], status: OrderItemStatus.CONFIRMED },
        draftOrder.items[1],
      ],
    });
    products.resolveForSale.mockResolvedValue([product()]);
    inventory.postSale.mockResolvedValue([
      {
        orderItemId: 'item-1',
        unitCost: null,
        lineCost: null,
      },
    ]);
    earnings.recordForProductOrder.mockResolvedValue([]);

    await service.confirmItems(
      'location-1',
      'order-1',
      { itemIds: ['item-1'], idempotencyKey: 'confirm-key-2' },
      owner,
    );

    expect(tx.orderItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['item-1'] } } }),
    );
    expect(inventory.postSale.mock.calls[0][3]).toEqual([
      expect.objectContaining({ orderItemId: 'item-1' }),
    ]);
  });

  it('returns the existing order for a repeated group confirmation idempotency key', async () => {
    const { service, tx, db, inventory, earnings } = setup();
    const hash = confirmItemsHash('location-1', 'order-1', ['item-1']);
    tx.orderOperation.create.mockRejectedValue({
      code: PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
    });
    tx.order.findFirst.mockResolvedValue(order(OrderStatus.ACTIVE));
    db.orderOperation.findUnique.mockResolvedValue({
      orderId: 'order-1',
      operationType: 'CONFIRM_PRODUCT_ITEMS',
      requestHash: hash,
    });
    db.order.findFirst.mockResolvedValue(
      order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED),
    );

    const result = await service.confirmItems(
      'location-1',
      'order-1',
      { itemIds: ['item-1'], idempotencyKey: 'confirm-key-3' },
      owner,
    );

    expect(result.items[0].status).toBe(OrderItemStatus.CONFIRMED);
    expect(inventory.postSale).not.toHaveBeenCalled();
    expect(earnings.recordForProductOrder).not.toHaveBeenCalled();
  });

  it('rejects a reused group confirmation idempotency key with different items', async () => {
    const { service, tx, db } = setup();
    tx.orderOperation.create.mockRejectedValue({
      code: PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
    });
    tx.order.findFirst.mockResolvedValue(order(OrderStatus.ACTIVE));
    db.orderOperation.findUnique.mockResolvedValue({
      orderId: 'order-1',
      operationType: 'CONFIRM_PRODUCT_ITEMS',
      requestHash: 'different',
    });

    const error = await service
      .confirmItems(
        'location-1',
        'order-1',
        { itemIds: ['item-1'], idempotencyKey: 'confirm-key-4' },
        owner,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ORDER_IDEMPOTENCY_CONFLICT',
    );
  });

  it('rejects service items in group confirmation without touching stock', async () => {
    const { service, tx, inventory, earnings } = setup();
    const active = order(OrderStatus.ACTIVE);
    tx.order.findFirst.mockResolvedValue({
      ...active,
      items: [
        {
          ...active.items[0],
          id: 'service-item-1',
          type: OrderItemType.SERVICE,
          catalogItemId: 'service-1',
        },
      ],
    });

    const error = await service
      .confirmItems(
        'location-1',
        'order-1',
        { itemIds: ['service-item-1'], idempotencyKey: 'confirm-key-5' },
        owner,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('ORDER_ITEM_NOT_DRAFT');
    expect(inventory.postSale).not.toHaveBeenCalled();
    expect(earnings.recordForProductOrder).not.toHaveBeenCalled();
  });

  it('does not confirm any selected products when one stock write fails', async () => {
    const { service, tx, products, inventory, earnings } = setup();
    const active = order(OrderStatus.ACTIVE);
    tx.order.findFirst.mockResolvedValue({
      ...active,
      items: [
        { ...active.items[0], id: 'item-1', catalogItemId: 'product-1' },
        {
          ...active.items[0],
          id: 'item-2',
          catalogItemId: 'product-2',
          productLocationId: 'product-location-2',
        },
      ],
    });
    products.resolveForSale.mockResolvedValue([product(), secondProduct()]);
    inventory.postSale.mockRejectedValue(new Error('insufficient stock'));

    await expect(
      service.confirmItems(
        'location-1',
        'order-1',
        { itemIds: ['item-1', 'item-2'], idempotencyKey: 'confirm-key-6' },
        owner,
      ),
    ).rejects.toThrow('insufficient stock');

    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
    expect(earnings.recordForProductOrder).not.toHaveBeenCalled();
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

    expect(tx.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingId: 'booking-1' } }),
    );
    expect(tx.order.upsert).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          clientId: 'client-1',
          occurredAt: new Date('2026-10-01T11:00:00.000Z'),
        }),
      }),
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

  it('rejects syncing completed booking services into a voided order', async () => {
    const { service, tx } = setup();
    tx.order.findUnique.mockResolvedValue({
      ...order(OrderStatus.VOIDED),
      bookingId: 'booking-1',
      items: [],
    });

    const error = await service
      .syncCompletedBooking(bookingWithService('1500.00'), owner, tx as never)
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('ORDER_NOT_ACTIVE');
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.orderItem.create).not.toHaveBeenCalled();
  });

  it('creates a new service line instead of reviving a reversed one', async () => {
    const { service, tx } = setup();
    const activeOrder = order(OrderStatus.ACTIVE);
    const orderWithReversedService = {
      ...activeOrder,
      bookingId: 'booking-1',
      items: [
        {
          ...activeOrder.items[0],
          id: 'service-item-old',
          type: OrderItemType.SERVICE,
          bookingItemId: 'booking-item-1',
          status: OrderItemStatus.REVERSED,
          catalogItemId: 'service-1',
          productLocationId: null,
          title: 'Haircut',
          sellerStaffId: 'staff-1',
          sellerName: 'Anna',
        },
      ],
    };
    const orderWithNewService = {
      ...activeOrder,
      bookingId: 'booking-1',
      items: [
        ...orderWithReversedService.items,
        {
          ...orderWithReversedService.items[0],
          id: 'service-item-new',
          status: OrderItemStatus.CONFIRMED,
        },
      ],
    };
    tx.order.findUnique.mockResolvedValueOnce(orderWithReversedService);
    tx.order.findFirst.mockResolvedValueOnce(orderWithNewService);
    tx.order.update.mockResolvedValue(orderWithNewService);

    await service.syncCompletedBooking(
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

    expect(tx.orderItem.update).not.toHaveBeenCalled();
    expect(tx.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          bookingItemId: 'booking-item-1',
          status: OrderItemStatus.CONFIRMED,
        }),
      }),
    );
  });

  it('adds multiple draft products to a booking order without treating service custom prices as product edits', async () => {
    const { service, tx, products, staff } = setup();
    const now = new Date('2026-10-01T10:00:00.000Z');
    const existingOrder = {
      ...order(OrderStatus.ACTIVE),
      bookingId: 'booking-1',
      items: [
        {
          ...order(OrderStatus.ACTIVE).items[0],
          id: 'service-item-1',
          type: OrderItemType.SERVICE,
          bookingItemId: 'booking-item-1',
          status: OrderItemStatus.CONFIRMED,
          catalogItemId: 'service-1',
          productLocationId: null,
          title: 'Haircut',
          customUnitPrice: new Prisma.Decimal(40),
        },
      ],
    };
    const refreshedOrder = {
      ...existingOrder,
      items: [
        ...existingOrder.items,
        {
          ...order(OrderStatus.ACTIVE).items[0],
          id: 'product-item-1',
          catalogItemId: 'product-1',
          customUnitPrice: null,
          lineTotal: new Prisma.Decimal(20),
        },
        {
          ...order(OrderStatus.ACTIVE).items[0],
          id: 'product-item-2',
          catalogItemId: 'product-2',
          customUnitPrice: null,
          lineTotal: new Prisma.Decimal(30),
        },
      ],
    };
    tx.order.findUnique.mockResolvedValue(existingOrder);
    tx.order.findFirst.mockResolvedValue(refreshedOrder);
    tx.order.update.mockResolvedValue(refreshedOrder);
    products.resolveForSale.mockResolvedValue([product(), secondProduct()]);
    staff.resolveForProductSale.mockResolvedValue([]);

    await service.addDraftProductsToBookingOrder(
      {
        id: 'booking-1',
        locationId: 'location-1',
        clientId: 'client-1',
        clientFirstName: 'Ann',
        clientLastName: 'Client',
        clientPhone: '+79000000000',
        endAt: now,
        items: [],
      } as never,
      [
        { productId: 'product-1', quantity: '1.000' },
        { productId: 'product-2', quantity: '1.000' },
      ],
      employee,
      tx as never,
    );

    expect(tx.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 'order-1',
          type: OrderItemType.PRODUCT,
          catalogItemId: 'product-1',
        }),
        expect.objectContaining({
          orderId: 'order-1',
          type: OrderItemType.PRODUCT,
          catalogItemId: 'product-2',
        }),
      ],
    });
  });

  it('versions service lines when a completed booking price or seller changes', async () => {
    const { service, tx } = setup();
    const activeOrder = order(OrderStatus.ACTIVE);
    const orderWithStaleService = {
      ...activeOrder,
      bookingId: 'booking-1',
      items: [
        {
          ...activeOrder.items[0],
          id: 'service-item-old',
          type: OrderItemType.SERVICE,
          bookingItemId: 'booking-item-1',
          status: OrderItemStatus.CONFIRMED,
          catalogItemId: 'service-1',
          productLocationId: null,
          title: 'Haircut',
          listUnitPrice: new Prisma.Decimal(50),
          customUnitPrice: null,
          unitPrice: new Prisma.Decimal(50),
          lineSubtotal: new Prisma.Decimal(50),
          lineTotal: new Prisma.Decimal(50),
          sellerStaffId: 'staff-1',
          sellerName: 'Anna',
          occurredAt: new Date('2026-10-01T11:00:00.000Z'),
        },
      ],
    };
    const orderWithVersionedService = {
      ...activeOrder,
      bookingId: 'booking-1',
      items: [
        {
          ...orderWithStaleService.items[0],
          status: OrderItemStatus.REVERSED,
        },
        {
          ...orderWithStaleService.items[0],
          id: 'service-item-new',
          customUnitPrice: new Prisma.Decimal(40),
          unitPrice: new Prisma.Decimal(40),
          lineSubtotal: new Prisma.Decimal(40),
          lineTotal: new Prisma.Decimal(40),
          sellerStaffId: 'staff-2',
          sellerName: 'Boris',
        },
      ],
    };
    tx.order.findUnique.mockResolvedValueOnce(orderWithStaleService);
    tx.order.findFirst.mockResolvedValueOnce(orderWithVersionedService);
    tx.order.update.mockResolvedValue(orderWithVersionedService);

    await service.syncCompletedBooking(
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
            customPrice: new Prisma.Decimal(40),
            staffId: 'staff-2',
            staffName: 'Boris',
            endAt: new Date('2026-10-01T11:00:00.000Z'),
          },
        ],
      } as never,
      owner,
      tx as never,
    );

    expect(tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['service-item-old'] } },
      data: { status: OrderItemStatus.REVERSED },
    });
    expect(tx.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          bookingItemId: 'booking-item-1',
          customUnitPrice: expect.objectContaining({}),
          sellerStaffId: 'staff-2',
          sellerName: 'Boris',
        }),
      }),
    );
    const created = tx.orderItem.create.mock.calls[0][0].data;
    expect(created.lineTotal.toFixed(2)).toBe('40.00');
  });

  it('keeps one confirmed service sale across repeated completion cycles', async () => {
    const { service, tx } = setup();
    const state = attachStatefulBookingOrder(tx);

    await service.syncCompletedBooking(
      bookingWithService('1500.00'),
      owner,
      tx as never,
    );
    await service.reverseCompletedBookingServices(
      bookingWithService('1500.00'),
      tx as never,
    );
    await service.syncCompletedBooking(
      bookingWithService('1500.00'),
      owner,
      tx as never,
    );
    await service.reverseCompletedBookingServices(
      bookingWithService('1500.00'),
      tx as never,
    );
    await service.syncCompletedBooking(
      bookingWithService('1500.00'),
      owner,
      tx as never,
    );

    const confirmed = state.order.items.filter(
      (item) => item.status === OrderItemStatus.CONFIRMED,
    );
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].lineTotal.toFixed(2)).toBe('1500.00');
    expect(state.order.totalAmount.toFixed(2)).toBe('1500.00');
    expect(tx.orderItem.create).toHaveBeenCalledTimes(3);
  });

  it('keeps only the latest confirmed service sale after price changes', async () => {
    const { service, tx } = setup();
    const state = attachStatefulBookingOrder(tx);

    await service.syncCompletedBooking(
      bookingWithService('1500.00'),
      owner,
      tx as never,
    );
    await service.syncCompletedBooking(
      bookingWithService('1200.00'),
      owner,
      tx as never,
    );
    await service.syncCompletedBooking(
      bookingWithService('1800.00'),
      owner,
      tx as never,
    );

    const confirmed = state.order.items.filter(
      (item) => item.status === OrderItemStatus.CONFIRMED,
    );
    const reversed = state.order.items.filter(
      (item) => item.status === OrderItemStatus.REVERSED,
    );
    expect(confirmed).toHaveLength(1);
    expect(reversed).toHaveLength(2);
    expect(confirmed[0].lineTotal.toFixed(2)).toBe('1800.00');
    expect(state.order.totalAmount.toFixed(2)).toBe('1800.00');
  });

  it('keeps the latest seller on the confirmed service sale', async () => {
    const { service, tx } = setup();
    const state = attachStatefulBookingOrder(tx);

    await service.syncCompletedBooking(
      bookingWithService('1500.00', 'staff-a', 'Anna'),
      owner,
      tx as never,
    );
    await service.syncCompletedBooking(
      bookingWithService('1500.00', 'staff-b', 'Boris'),
      owner,
      tx as never,
    );

    const confirmed = state.order.items.filter(
      (item) => item.status === OrderItemStatus.CONFIRMED,
    );
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].sellerStaffId).toBe('staff-b');
    expect(confirmed[0].sellerName).toBe('Boris');
  });

  it('does not create extra service versions when sync is repeated unchanged', async () => {
    const { service, tx } = setup();
    const state = attachStatefulBookingOrder(tx);

    await service.syncCompletedBooking(
      bookingWithService('1500.00'),
      owner,
      tx as never,
    );
    await service.syncCompletedBooking(
      bookingWithService('1500.00'),
      owner,
      tx as never,
    );

    const confirmed = state.order.items.filter(
      (item) => item.status === OrderItemStatus.CONFIRMED,
    );
    expect(confirmed).toHaveLength(1);
    expect(tx.orderItem.create).toHaveBeenCalledTimes(1);
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('reverses a confirmed product item without voiding the whole order', async () => {
    const { service, tx, inventory, earnings } = setup();
    tx.order.findFirst
      .mockResolvedValueOnce(
        order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED),
      )
      .mockResolvedValueOnce({
        ...order(OrderStatus.ACTIVE),
        items: [
          {
            ...order(OrderStatus.ACTIVE).items[0],
            status: OrderItemStatus.REVERSED,
          },
        ],
      });
    tx.order.update.mockResolvedValue({
      ...order(OrderStatus.ACTIVE),
      items: [
        {
          ...order(OrderStatus.ACTIVE).items[0],
          status: OrderItemStatus.REVERSED,
        },
      ],
    });

    const result = await service.reverseItem(
      'location-1',
      'order-1',
      'item-1',
      'returned',
      owner,
    );

    expect(earnings.reverseForProductOrderItem).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      'item-1',
      'returned',
      owner,
      tx,
    );
    expect(inventory.reverseSaleItem).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      'item-1',
      expect.any(Date),
      tx,
    );
    expect(tx.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: { status: OrderItemStatus.REVERSED },
      }),
    );
    expect(result.items[0].status).toBe(OrderItemStatus.REVERSED);
  });
});
