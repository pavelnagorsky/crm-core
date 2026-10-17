import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
  ProductStatus,
  ProductUnit,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { OrderPricingCalculator } from './calculators/order-pricing.calculator.js';
import { OrderTargetStatus } from './enums/order-target-status.enum.js';
import { OrderWithItems } from './interfaces/order-with-items.interface.js';
import { OrdersFacade } from './orders.facade.js';
import { OrderStateRules } from './rules/order-state.rules.js';
import { OrderAuditService } from './services/order-audit.service.js';
import { OrderBookingSyncService } from './services/order-booking-sync.service.js';
import { OrderCreationService } from './services/order-creation.service.js';
import { OrderDraftMutationService } from './services/order-draft-mutation.service.js';
import { OrderDraftService } from './services/order-draft.service.js';
import { OrderPersistenceService } from './services/order-persistence.service.js';
import { OrderProductTransitionService } from './services/order-product-transition.service.js';
import { OrderReturnService } from './services/order-return.service.js';

const owner = { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER };
const employee = { id: 'staff-1', name: 'Staff', role: AuditActorRole.STAFF };

function order(
  status: OrderStatus,
  itemStatus: OrderItemStatus = OrderItemStatus.DRAFT,
): OrderWithItems {
  const now = new Date('2026-10-01T10:00:00.000Z');
  return {
    id: 'order-1',
    locationId: 'location-1',
    bookingId: null,
    idempotencyKey: null,
    clientId: null,
    clientName: null,
    clientPhone: null,
    currency: 'BYN',
    status,
    version: 1,
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
        productLocation: null,
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
        returnItems: [],
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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
    orderReturn: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    auditLog: {
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
      groupBy: vi.fn(),
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
    reverseSaleItemQuantity: vi.fn(),
  };
  const staff = { resolveForProductSale: vi.fn().mockResolvedValue([]) };
  const earnings = {
    recordForProductOrder: vi.fn(),
    reverseForProductOrder: vi.fn(),
    reverseForProductOrderItem: vi.fn(),
    reverseForProductOrderItemAmount: vi.fn(),
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
  const compute = new OrderPricingCalculator();
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
    events as never,
  );
  const stateAssertions = new OrderStateRules();
  const transitions = new OrderProductTransitionService(
    db as never,
    products as never,
    inventory as never,
    staff as never,
    earnings as never,
    persistence,
  );
  const returns = new OrderReturnService(
    inventory as never,
    earnings as never,
    persistence,
    compute,
    stateAssertions,
    locations as never,
    events as never,
  );
  const audits = new OrderAuditService(events as never);
  const creation = new OrderCreationService(
    db as never,
    drafts,
    persistence,
    transitions,
    audits,
  );
  const mutations = new OrderDraftMutationService(
    locations as never,
    drafts,
    persistence,
    stateAssertions,
    audits,
  );
  const service = new OrdersFacade(
    locations as never,
    drafts,
    bookingSync,
    persistence,
    transitions,
    returns,
    creation,
    mutations,
    audits,
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
      items: [] as ReturnType<typeof order>['items'],
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
      returnItems: [],
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

describe('OrdersFacade', () => {
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
      true,
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
        false,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it('rejects fractional quantities for piece products', async () => {
    const { service, db, products } = setup();
    products.resolveForSale.mockResolvedValue([product()]);

    const error = await service
      .create(
        'location-1',
        {
          items: [{ productId: 'product-1', quantity: '0.500' }],
        },
        owner,
        true,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ORDER_QUANTITY_MUST_BE_WHOLE',
    );
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
    tx.order.create.mockResolvedValue(draftOrder);
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
      true,
    );

    expect(result.items.map((item) => item.status)).toEqual([
      OrderItemStatus.CONFIRMED,
      OrderItemStatus.CONFIRMED,
    ]);
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationId: 'location-1',
          idempotencyKey: 'sale-key-1',
        }),
      }),
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.order.findFirst.mock.invocationCallOrder[0],
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

  it('rejects fractional quantities for immediate piece product sales', async () => {
    const { service, tx, products, inventory, earnings } = setup();
    products.resolveForSale.mockResolvedValue([product()]);
    tx.order.findFirst.mockResolvedValueOnce(null);

    const error = await service
      .create(
        'location-1',
        {
          confirmImmediately: true,
          idempotencyKey: 'sale-key-1',
          items: [{ productId: 'product-1', quantity: '0.500' }],
        },
        owner,
        true,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ORDER_QUANTITY_MUST_BE_WHOLE',
    );
    expect(tx.order.upsert).not.toHaveBeenCalled();
    expect(inventory.postSale).not.toHaveBeenCalled();
    expect(earnings.recordForProductOrder).not.toHaveBeenCalled();
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
      true,
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
        true,
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
    tx.order.create.mockResolvedValue(draftOrder);
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
        true,
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
        version: 1,
        items: [{ productId: 'product-1', quantity: '2.000' }],
      },
      employee,
      false,
    );

    const item = tx.orderItem.create.mock.calls[0][0].data;
    expect(item.customUnitPrice.toFixed(2)).toBe('15.00');
    expect(item.unitPrice.toFixed(2)).toBe('15.00');
    expect(item.lineTotal.toFixed(2)).toBe('30.00');
  });

  it('updates draft product items in a partially confirmed order without touching confirmed lines', async () => {
    const { service, tx, products, events } = setup();
    const active = order(OrderStatus.ACTIVE);
    const confirmedService = {
      ...active.items[0],
      id: 'service-item-1',
      type: OrderItemType.SERVICE,
      bookingItemId: 'booking-item-1',
      status: OrderItemStatus.CONFIRMED,
      catalogItemId: 'service-1',
      productLocationId: null,
      title: 'Haircut',
      quantity: new Prisma.Decimal(1),
      listUnitPrice: new Prisma.Decimal(50),
      unitPrice: new Prisma.Decimal(50),
      lineSubtotal: new Prisma.Decimal(50),
      lineTotal: new Prisma.Decimal(50),
    };
    const draftProduct = {
      ...active.items[0],
      id: 'draft-product-1',
      status: OrderItemStatus.DRAFT,
      catalogItemId: 'product-1',
      productLocationId: 'product-location-1',
      title: 'Shampoo',
      quantity: new Prisma.Decimal(1),
      lineTotal: new Prisma.Decimal(15),
    };
    const locked = {
      ...active,
      bookingId: 'booking-1',
      clientId: 'client-1',
      clientName: 'Ann Client',
      clientPhone: '+79000000000',
      items: [confirmedService, draftProduct],
    };
    const refreshed = {
      ...locked,
      items: [
        confirmedService,
        {
          ...draftProduct,
          quantity: new Prisma.Decimal(2),
          lineSubtotal: new Prisma.Decimal(30),
          lineTotal: new Prisma.Decimal(30),
        },
        {
          ...active.items[0],
          id: 'draft-product-2',
          catalogItemId: 'product-2',
          productLocationId: 'product-location-2',
          title: 'Conditioner',
          quantity: new Prisma.Decimal(1),
          listUnitPrice: new Prisma.Decimal(30),
          unitPrice: new Prisma.Decimal(30),
          lineSubtotal: new Prisma.Decimal(30),
          lineTotal: new Prisma.Decimal(30),
        },
      ],
    };
    tx.order.findFirst
      .mockResolvedValueOnce(locked)
      .mockResolvedValueOnce(refreshed);
    tx.order.update.mockResolvedValueOnce(locked).mockResolvedValueOnce({
      ...refreshed,
      totalAmount: new Prisma.Decimal(110),
    });
    products.resolveForSale.mockResolvedValue([product(), secondProduct()]);

    const result = await service.update(
      'location-1',
      'order-1',
      {
        version: 1,
        items: [
          { id: 'draft-product-1', productId: 'product-1', quantity: '2.000' },
          { productId: 'product-2', quantity: '1.000' },
        ],
      },
      owner,
      true,
    );

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'draft-product-1' },
      data: expect.objectContaining({
        type: OrderItemType.PRODUCT,
        catalogItemId: 'product-1',
      }),
    });
    expect(tx.orderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        type: OrderItemType.PRODUCT,
        catalogItemId: 'product-2',
      }),
    });
    expect(tx.orderItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', version: 1 },
      data: { version: { increment: 1 } },
    });
    expect(result.items.find((item) => item.id === 'service-item-1')).toEqual(
      expect.objectContaining({ status: OrderItemStatus.CONFIRMED }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'ORDER_UPDATED',
        payload: expect.objectContaining({
          itemChanges: expect.objectContaining({
            added: [expect.objectContaining({ productId: 'product-2' })],
            changed: [
              expect.objectContaining({ orderItemId: 'draft-product-1' }),
            ],
          }),
        }),
      }),
    );
  });

  it('merges an added product into an existing draft product item', async () => {
    const { service, tx, products, events } = setup();
    const active = order(OrderStatus.ACTIVE);
    const refreshed = {
      ...active,
      listTotalAmount: new Prisma.Decimal(40),
      subtotalAmount: new Prisma.Decimal(30),
      totalAmount: new Prisma.Decimal(30),
      items: [
        {
          ...active.items[0],
          quantity: new Prisma.Decimal(2),
          lineSubtotal: new Prisma.Decimal(30),
          lineTotal: new Prisma.Decimal(30),
        },
      ],
    };
    tx.order.findFirst
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(refreshed);
    tx.order.update.mockResolvedValue(refreshed);
    products.resolveForSale.mockResolvedValue([product()]);

    await service.addDraftItems(
      'location-1',
      'order-1',
      { items: [{ productId: 'product-1', quantity: '1.000' }] },
      owner,
      true,
    );

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: expect.objectContaining({
        catalogItemId: 'product-1',
        quantity: '2.000',
        customUnitPrice: expect.objectContaining({}),
        lineTotal: expect.objectContaining({}),
      }),
    });
    const updateData = tx.orderItem.update.mock.calls[0][0].data;
    expect(updateData.customUnitPrice.toFixed(2)).toBe('15.00');
    expect(updateData.lineTotal.toFixed(2)).toBe('30.00');
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'ORDER_UPDATED',
        payload: expect.objectContaining({
          itemChanges: expect.objectContaining({
            added: [],
            changed: [
              expect.objectContaining({
                orderItemId: 'item-1',
                before: expect.objectContaining({ quantity: '1.000' }),
                after: expect.objectContaining({ quantity: '2.000' }),
              }),
            ],
          }),
        }),
      }),
    );
  });

  it('adds a new draft item when the same product is already confirmed', async () => {
    const { service, tx, products } = setup();
    const confirmed = order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED);
    const refreshed = {
      ...confirmed,
      items: [
        ...confirmed.items,
        {
          ...confirmed.items[0],
          id: 'item-2',
          status: OrderItemStatus.DRAFT,
          confirmedAt: null,
          occurredAt: null,
        },
      ],
    };
    tx.order.findFirst
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(refreshed);
    tx.order.update.mockResolvedValue(refreshed);
    products.resolveForSale.mockResolvedValue([product()]);

    await service.addDraftItems(
      'location-1',
      'order-1',
      { items: [{ productId: 'product-1', quantity: '1.000' }] },
      owner,
      true,
    );

    expect(tx.orderItem.update).not.toHaveBeenCalled();
    expect(tx.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 'order-1',
          type: OrderItemType.PRODUCT,
          catalogItemId: 'product-1',
        }),
      ],
    });
  });

  it('rejects adding fractional quantities for piece products', async () => {
    const { service, tx, products } = setup();
    tx.order.findFirst.mockResolvedValue(order(OrderStatus.ACTIVE));
    products.resolveForSale.mockResolvedValue([product()]);

    const error = await service
      .addDraftItems(
        'location-1',
        'order-1',
        { items: [{ productId: 'product-1', quantity: '0.500' }] },
        owner,
        true,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ORDER_QUANTITY_MUST_BE_WHOLE',
    );
    expect(tx.orderItem.update).not.toHaveBeenCalled();
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
  });

  it('updates a draft item for a product that also has a confirmed line', async () => {
    const { service, tx, products } = setup();
    const active = order(OrderStatus.ACTIVE);
    const confirmedProduct = {
      ...active.items[0],
      id: 'confirmed-product-1',
      status: OrderItemStatus.CONFIRMED,
      confirmedAt: new Date('2026-10-01T10:00:00.000Z'),
      occurredAt: new Date('2026-10-01T10:00:00.000Z'),
    };
    const draftProduct = {
      ...active.items[0],
      id: 'draft-product-1',
      status: OrderItemStatus.DRAFT,
      confirmedAt: null,
      occurredAt: null,
    };
    const locked = { ...active, items: [confirmedProduct, draftProduct] };
    const refreshed = {
      ...locked,
      items: [
        confirmedProduct,
        {
          ...draftProduct,
          quantity: new Prisma.Decimal(2),
          lineSubtotal: new Prisma.Decimal(30),
          lineTotal: new Prisma.Decimal(30),
        },
      ],
    };
    tx.order.findFirst
      .mockResolvedValueOnce(locked)
      .mockResolvedValueOnce(refreshed);
    tx.order.update
      .mockResolvedValueOnce(locked)
      .mockResolvedValueOnce(refreshed);
    products.resolveForSale.mockResolvedValue([product()]);

    await service.update(
      'location-1',
      'order-1',
      {
        version: 1,
        items: [
          { id: 'draft-product-1', productId: 'product-1', quantity: '2.000' },
        ],
      },
      owner,
      true,
    );

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'draft-product-1' },
      data: expect.objectContaining({
        catalogItemId: 'product-1',
        quantity: '2.000',
      }),
    });
  });

  it('rejects editing a confirmed product item by id', async () => {
    const { service, tx, products } = setup();
    tx.order.findFirst.mockResolvedValue(
      order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED),
    );

    const error = await service
      .update(
        'location-1',
        'order-1',
        {
          version: 1,
          items: [{ id: 'item-1', productId: 'product-1', quantity: '2.000' }],
        },
        owner,
        true,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('ORDER_ITEM_IMMUTABLE');
    expect(products.resolveForSale).not.toHaveBeenCalled();
    expect(tx.orderItem.update).not.toHaveBeenCalled();
  });

  it('rejects a stale order update version before resolving products', async () => {
    const { service, tx, products } = setup();
    tx.order.findFirst.mockResolvedValue({
      ...order(OrderStatus.ACTIVE),
      version: 2,
    });

    const error = await service
      .update(
        'location-1',
        'order-1',
        {
          version: 1,
          items: [{ id: 'item-1', productId: 'product-1', quantity: '2.000' }],
        },
        owner,
        true,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('ORDER_CHANGED');
    expect(products.resolveForSale).not.toHaveBeenCalled();
    expect(tx.orderItem.update).not.toHaveBeenCalled();
  });

  it('rejects an order update when the version changes during save', async () => {
    const { service, tx, products } = setup();
    tx.order.findFirst.mockResolvedValue(order(OrderStatus.ACTIVE));
    tx.order.updateMany.mockResolvedValueOnce({ count: 0 });

    const error = await service
      .update(
        'location-1',
        'order-1',
        {
          version: 1,
          items: [{ id: 'item-1', productId: 'product-1', quantity: '2.000' }],
        },
        owner,
        true,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('ORDER_CHANGED');
    expect(products.resolveForSale).not.toHaveBeenCalled();
    expect(tx.orderItem.update).not.toHaveBeenCalled();
  });

  it('removes only draft product items from a booking order', async () => {
    const { service, tx } = setup();
    const active = order(OrderStatus.ACTIVE);
    const draftProduct = {
      ...active.items[0],
      id: 'draft-product-1',
      status: OrderItemStatus.DRAFT,
      catalogItemId: 'product-1',
    };
    const confirmedProduct = {
      ...active.items[0],
      id: 'confirmed-product-1',
      status: OrderItemStatus.CONFIRMED,
      catalogItemId: 'product-2',
    };
    const bookingOrder = {
      ...active,
      bookingId: 'booking-1',
      items: [draftProduct, confirmedProduct],
    };
    tx.order.findUnique.mockResolvedValue(bookingOrder);
    tx.order.findFirst.mockResolvedValue({
      ...bookingOrder,
      items: [confirmedProduct],
    });
    tx.order.update.mockResolvedValue({
      ...bookingOrder,
      items: [confirmedProduct],
    });

    const removed = await service.removeDraftProductsForBooking(
      {
        id: 'booking-1',
        locationId: 'location-1',
      } as never,
      tx as never,
    );

    expect(tx.orderItem.deleteMany).toHaveBeenCalledWith({
      where: {
        orderId: 'order-1',
        id: { in: ['draft-product-1'] },
        type: OrderItemType.PRODUCT,
        status: OrderItemStatus.DRAFT,
      },
    });
    expect(removed).toEqual([
      expect.objectContaining({
        orderItemId: 'draft-product-1',
        productId: 'product-1',
      }),
    ]);
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

  it('rejects fractional piece quantities in product price previews', async () => {
    const { service, db, products } = setup();
    products.resolveForSale.mockResolvedValue([product()]);

    const error = await service
      .priceProductItems('location-1', [
        { productId: 'product-1', quantity: '0.500' },
      ])
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ORDER_QUANTITY_MUST_BE_WHOLE',
    );
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
        { itemIds: ['item-1'], idempotencyKey: '' },
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
    const { service, tx, products, staff, events } = setup();
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
    tx.order.findFirst
      .mockResolvedValueOnce(existingOrder)
      .mockResolvedValueOnce(refreshedOrder);
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
      true,
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
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        brandId: 'brand-1',
        locationId: 'location-1',
        entityType: 'ORDER',
        entityId: 'order-1',
        eventType: 'ORDER_UPDATED',
        actionType: 'MODIFY',
        payload: expect.objectContaining({
          itemChanges: expect.objectContaining({
            added: [
              expect.objectContaining({ productId: 'product-1' }),
              expect.objectContaining({ productId: 'product-2' }),
            ],
            removed: [],
            changed: [],
          }),
        }),
      }),
    );
  });

  it('rejects fractional quantities when adding piece products to a booking order', async () => {
    const { service, tx, products } = setup();
    const now = new Date('2026-10-01T10:00:00.000Z');
    const existingOrder = {
      ...order(OrderStatus.ACTIVE),
      bookingId: 'booking-1',
      items: [],
    };
    tx.order.findUnique.mockResolvedValue(existingOrder);
    tx.order.findFirst.mockResolvedValue(existingOrder);
    products.resolveForSale.mockResolvedValue([product()]);

    const error = await service
      .addDraftProductsToBookingOrder(
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
        [{ productId: 'product-1', quantity: '0.500' }],
        owner,
        tx as never,
        true,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ORDER_QUANTITY_MUST_BE_WHOLE',
    );
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(tx.orderItem.update).not.toHaveBeenCalled();
  });

  it('merges a repeated product into an existing booking draft item', async () => {
    const { service, tx, products, events } = setup();
    const now = new Date('2026-10-01T10:00:00.000Z');
    const existingOrder = {
      ...order(OrderStatus.ACTIVE),
      bookingId: 'booking-1',
      items: [
        {
          ...order(OrderStatus.ACTIVE).items[0],
          id: 'draft-product-1',
          status: OrderItemStatus.DRAFT,
          catalogItemId: 'product-1',
          quantity: new Prisma.Decimal(1),
          customUnitPrice: null,
          unitPrice: new Prisma.Decimal(20),
          lineSubtotal: new Prisma.Decimal(20),
          lineTotal: new Prisma.Decimal(20),
        },
      ],
    };
    const refreshedOrder = {
      ...existingOrder,
      items: [
        {
          ...existingOrder.items[0],
          quantity: new Prisma.Decimal(2),
          lineSubtotal: new Prisma.Decimal(40),
          lineTotal: new Prisma.Decimal(40),
        },
      ],
    };
    tx.order.findUnique.mockResolvedValue(existingOrder);
    tx.order.findFirst
      .mockResolvedValueOnce(existingOrder)
      .mockResolvedValueOnce(refreshedOrder);
    tx.order.update.mockResolvedValue(refreshedOrder);
    products.resolveForSale.mockResolvedValue([product()]);

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
      [{ productId: 'product-1', quantity: '1.000' }],
      owner,
      tx as never,
      true,
    );

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'draft-product-1' },
      data: expect.objectContaining({
        catalogItemId: 'product-1',
        quantity: '2.000',
      }),
    });
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'ORDER_UPDATED',
        payload: expect.objectContaining({
          itemChanges: expect.objectContaining({
            added: [],
            changed: [
              expect.objectContaining({
                orderItemId: 'draft-product-1',
              }),
            ],
          }),
        }),
      }),
    );
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

    expect(earnings.reverseForProductOrderItemAmount).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      'item-1',
      expect.objectContaining({}),
      'returned',
      owner,
      tx,
    );
    const reversedAmount =
      earnings.reverseForProductOrderItemAmount.mock.calls[0][3];
    expect(reversedAmount.toFixed(2)).toBe('15.00');
    expect(inventory.reverseSaleItemQuantity).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      'item-1',
      expect.objectContaining({}),
      expect.any(Date),
      tx,
    );
    const reversedQuantity = inventory.reverseSaleItemQuantity.mock.calls[0][3];
    expect(reversedQuantity.toFixed(3)).toBe('1.000');
    expect(tx.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: { status: OrderItemStatus.REVERSED },
      }),
    );
    expect(result.items[0].status).toBe(OrderItemStatus.REVERSED);
  });

  it('reverses only the remaining quantity after partial returns', async () => {
    const { service, tx, inventory, earnings } = setup();
    const confirmed = {
      ...order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED),
      items: [
        {
          ...order(OrderStatus.ACTIVE).items[0],
          status: OrderItemStatus.CONFIRMED,
          quantity: new Prisma.Decimal(5),
          customUnitPrice: null,
          unitPrice: new Prisma.Decimal(20),
          lineSubtotal: new Prisma.Decimal(100),
          lineTotal: new Prisma.Decimal(100),
          returnItems: [
            {
              quantity: new Prisma.Decimal(3),
              lineTotal: new Prisma.Decimal(60),
              return: { status: 'POSTED' },
            },
          ],
        },
      ],
    };
    const reversed = {
      ...confirmed,
      totalAmount: new Prisma.Decimal(0),
      items: [
        {
          ...confirmed.items[0],
          status: OrderItemStatus.REVERSED,
        },
      ],
    };
    tx.order.findFirst
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(reversed);
    tx.order.update.mockResolvedValue(reversed);

    await service.reverseItem(
      'location-1',
      'order-1',
      'item-1',
      'returned remaining',
      owner,
    );

    expect(
      earnings.reverseForProductOrderItemAmount.mock.calls[0][3].toFixed(2),
    ).toBe('40.00');
    expect(inventory.reverseSaleItemQuantity.mock.calls[0][3].toFixed(3)).toBe(
      '2.000',
    );
    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { status: OrderItemStatus.REVERSED },
    });
    const totalsUpdate = tx.order.update.mock.calls[0][0].data;
    expect(totalsUpdate.listTotalAmount.toFixed(2)).toBe('0.00');
    expect(totalsUpdate.subtotalAmount.toFixed(2)).toBe('0.00');
    expect(totalsUpdate.totalAmount.toFixed(2)).toBe('0.00');
  });

  it('restores the remaining cost snapshot on the final partial return', async () => {
    const { service, tx } = setup();
    const confirmed = {
      ...order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED),
      items: [
        {
          ...order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED).items[0],
          quantity: new Prisma.Decimal(3),
          unitCostSnapshot: new Prisma.Decimal('3.33333333'),
          lineCostSnapshot: new Prisma.Decimal(10),
          returnItems: [
            {
              quantity: new Prisma.Decimal(2),
              listUnitPrice: new Prisma.Decimal(20),
              customUnitPrice: new Prisma.Decimal(15),
              unitPrice: new Prisma.Decimal(15),
              lineSubtotal: new Prisma.Decimal(30),
              discountTotal: new Prisma.Decimal(0),
              lineTotal: new Prisma.Decimal(30),
              lineCostSnapshot: new Prisma.Decimal('6.67'),
              return: { status: 'POSTED' },
            },
          ],
        },
      ],
    };
    tx.order.findFirst.mockResolvedValue(confirmed);
    tx.orderReturn.create.mockResolvedValue({ id: 'return-1', items: [] });
    tx.order.update.mockResolvedValue(confirmed);
    await service.createReturn(
      'location-1',
      'order-1',
      {
        idempotencyKey: 'last-partial-return',
        reason: 'Return remaining unit',
        items: [{ orderItemId: 'item-1', quantity: '1.000' }],
      },
      owner,
    );
    expect(
      tx.orderReturn.create.mock.calls[0][0].data.items.create[0].lineCostSnapshot.toFixed(
        2,
      ),
    ).toBe('3.33');
  });

  it('creates a partial product return with explicit quantity', async () => {
    const { service, tx, inventory, earnings } = setup();
    const confirmed = {
      ...order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED),
      items: [
        {
          ...order(OrderStatus.ACTIVE).items[0],
          status: OrderItemStatus.CONFIRMED,
          quantity: new Prisma.Decimal(5),
          listUnitPrice: new Prisma.Decimal(10),
          customUnitPrice: null,
          unitPrice: new Prisma.Decimal(10),
          lineSubtotal: new Prisma.Decimal(50),
          lineTotal: new Prisma.Decimal(50),
          unitCostSnapshot: new Prisma.Decimal(3),
          lineCostSnapshot: new Prisma.Decimal(15),
          sellerStaffId: 'staff-1',
          sellerName: 'Seller',
          returnItems: [],
        },
      ],
    };
    const returnItem = {
      id: 'return-item-1',
      returnId: 'return-1',
      orderItemId: 'item-1',
      productLocationId: 'product-location-1',
      productId: 'product-1',
      categoryId: null,
      title: 'Shampoo',
      sku: 'SKU-1',
      unit: ProductUnit.PIECE,
      quantity: new Prisma.Decimal(3),
      listUnitPrice: new Prisma.Decimal(10),
      customUnitPrice: null,
      unitPrice: new Prisma.Decimal(10),
      lineSubtotal: new Prisma.Decimal(30),
      discountTotal: new Prisma.Decimal(0),
      lineTotal: new Prisma.Decimal(30),
      unitCostSnapshot: new Prisma.Decimal(3),
      lineCostSnapshot: new Prisma.Decimal(9),
      sellerStaffId: 'staff-1',
      sellerName: 'Seller',
      createdAt: new Date('2026-10-01T10:05:00.000Z'),
      return: { status: 'POSTED' },
    };
    const withReturn = {
      ...confirmed,
      items: [{ ...confirmed.items[0], returnItems: [returnItem] }],
    };
    const updated = {
      ...withReturn,
      totalAmount: new Prisma.Decimal(20),
      subtotalAmount: new Prisma.Decimal(20),
      listTotalAmount: new Prisma.Decimal(20),
    };
    tx.order.findFirst
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(withReturn);
    tx.orderReturn.create.mockResolvedValue({
      id: 'return-1',
      items: [returnItem],
    });
    tx.order.update.mockResolvedValue(updated);

    const result = await service.createReturn(
      'location-1',
      'order-1',
      {
        idempotencyKey: 'return-key-1',
        reason: 'customer returned part',
        occurredAt: '2026-10-01T10:05:00.000Z',
        items: [{ orderItemId: 'item-1', quantity: '3.000' }],
      },
      owner,
    );

    const createData = tx.orderReturn.create.mock.calls[0][0].data;
    expect(createData.items.create[0].quantity.toFixed(3)).toBe('3.000');
    expect(createData.items.create[0].lineTotal.toFixed(2)).toBe('30.00');
    expect(createData.items.create[0].lineCostSnapshot.toFixed(2)).toBe('9.00');
    expect(inventory.reverseSaleItemQuantity).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      'item-1',
      expect.objectContaining({}),
      new Date('2026-10-01T10:05:00.000Z'),
      tx,
      'return-item-1',
    );
    expect(earnings.reverseForProductOrderItemAmount).toHaveBeenCalledWith(
      'location-1',
      'order-1',
      'item-1',
      expect.objectContaining({}),
      'customer returned part',
      owner,
      tx,
      'return-item-1',
    );
    expect(
      earnings.reverseForProductOrderItemAmount.mock.calls[0][3].toFixed(2),
    ).toBe('30.00');
    expect(result.totalAmount.toFixed(2)).toBe('20.00');
  });

  it('rejects a product return quantity above the remaining quantity', async () => {
    const { service, tx, inventory, earnings } = setup();
    const confirmed = order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED);
    tx.order.findFirst.mockResolvedValue(confirmed);

    const error = await service
      .createReturn(
        'location-1',
        'order-1',
        {
          idempotencyKey: 'return-key-1',
          reason: 'too many',
          items: [{ orderItemId: 'item-1', quantity: '2.000' }],
        },
        owner,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ORDER_RETURN_QUANTITY_EXCEEDS_REMAINING',
    );
    expect(tx.orderReturn.create).not.toHaveBeenCalled();
    expect(inventory.reverseSaleItemQuantity).not.toHaveBeenCalled();
    expect(earnings.reverseForProductOrderItemAmount).not.toHaveBeenCalled();
  });

  it('rejects a fractional product return for piece items', async () => {
    const { service, tx, inventory, earnings } = setup();
    const confirmed = order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED);
    tx.order.findFirst.mockResolvedValue(confirmed);

    const error = await service
      .createReturn(
        'location-1',
        'order-1',
        {
          idempotencyKey: 'return-key-1',
          reason: 'half piece',
          items: [{ orderItemId: 'item-1', quantity: '0.500' }],
        },
        owner,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ORDER_QUANTITY_MUST_BE_WHOLE',
    );
    expect(tx.orderReturn.create).not.toHaveBeenCalled();
    expect(inventory.reverseSaleItemQuantity).not.toHaveBeenCalled();
    expect(earnings.reverseForProductOrderItemAmount).not.toHaveBeenCalled();
  });

  it('returns the existing order on an idempotent return retry', async () => {
    const { service, tx, inventory, earnings } = setup();
    const dto = {
      idempotencyKey: 'return-key-1',
      reason: 'customer returned part',
      occurredAt: '2026-10-01T10:05:00.000Z',
      items: [{ orderItemId: 'item-1', quantity: '1.000' }],
    };
    const confirmed = order(OrderStatus.ACTIVE, OrderItemStatus.CONFIRMED);
    const existing = {
      ...confirmed,
      totalAmount: new Prisma.Decimal(0),
      items: [
        {
          ...confirmed.items[0],
          returnItems: [
            {
              quantity: new Prisma.Decimal(1),
              return: { status: 'POSTED' },
            },
          ],
        },
      ],
    };
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          orderId: 'order-1',
          reason: dto.reason,
          occurredAt: dto.occurredAt,
          items: dto.items,
        }),
      )
      .digest('hex');
    tx.order.findFirst
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(existing);
    tx.orderReturn.create.mockRejectedValue({
      code: PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION,
    });
    tx.orderReturn.findUnique.mockResolvedValue({
      id: 'return-1',
      orderId: 'order-1',
      requestHash,
    });

    const result = await service.createReturn(
      'location-1',
      'order-1',
      dto,
      owner,
    );

    expect(result).toBe(existing);
    expect(inventory.reverseSaleItemQuantity).not.toHaveBeenCalled();
    expect(earnings.reverseForProductOrderItemAmount).not.toHaveBeenCalled();
  });

  it('counts orders by status for the same search filters', async () => {
    const { db, service } = setup();
    db.order.groupBy.mockResolvedValue([
      { status: OrderStatus.ACTIVE, _count: { _all: 3 } },
    ]);

    const counts = await service.getStatusCounts('location-1', {
      search: ' sham ',
      clientId: 'client-1',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-02T00:00:00.000Z',
    });

    expect(db.order.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: {
        locationId: 'location-1',
        id: undefined,
        status: undefined,
        clientId: 'client-1',
        bookingId: undefined,
        occurredAt: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lte: new Date('2026-10-02T00:00:00.000Z'),
        },
        OR: [
          { clientName: { contains: 'sham', mode: 'insensitive' } },
          { clientPhone: { contains: 'sham' } },
          {
            items: {
              some: { title: { contains: 'sham', mode: 'insensitive' } },
            },
          },
          {
            items: { some: { sku: { contains: 'sham', mode: 'insensitive' } } },
          },
        ],
      },
      _count: { _all: true },
    });
    expect(counts).toEqual([
      { status: OrderStatus.ACTIVE, count: 3 },
      { status: OrderStatus.VOIDED, count: 0 },
    ]);
  });

  it('matches a client full name in any word order', async () => {
    const { db, service } = setup();
    db.order.groupBy.mockResolvedValue([]);

    await service.getStatusCounts('location-1', {
      search: '  Ковалева   Мария  ',
    });

    expect(db.order.groupBy.mock.calls[0][0].where.OR.at(-1)).toEqual({
      AND: [
        { clientName: { contains: 'Ковалева', mode: 'insensitive' } },
        { clientName: { contains: 'Мария', mode: 'insensitive' } },
      ],
    });
  });

  it('filters orders by sale id', async () => {
    const { db, service } = setup();
    db.order.groupBy.mockResolvedValue([]);
    const orderId = 'eb516132-b50b-449d-9e6e-0ab0801cd714';

    await service.getStatusCounts('location-1', { orderId });

    expect(db.order.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: {
        locationId: 'location-1',
        id: orderId,
        status: undefined,
        clientId: undefined,
        bookingId: undefined,
        occurredAt: undefined,
      },
      _count: { _all: true },
    });
  });
});
