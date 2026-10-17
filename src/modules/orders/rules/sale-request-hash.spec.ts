import { CreateOrderDto } from '../dto/create-order.dto.js';
import { saleRequestHash } from './sale-request-hash.js';

describe('sale request identity', () => {
  const request: CreateOrderDto = {
    items: [
      {
        productId: 'a',
        quantity: '1.000',
        customUnitPrice: '20.00',
        sellerStaffId: 'seller',
      },
      { productId: 'b', quantity: '2.500' },
    ],
    occurredAt: '2026-10-17T12:00:00+03:00',
    note: 'Sale',
  };
  it('normalizes amounts, time offsets, optional values and product order', () => {
    expect(saleRequestHash('location', request)).toBe(
      saleRequestHash('location', {
        ...request,
        clientId: null,
        occurredAt: '2026-10-17T09:00:00.000Z',
        note: ' Sale ',
        items: [
          {
            productId: 'b',
            quantity: '2.5',
            customUnitPrice: null,
            sellerStaffId: null,
          },
          {
            productId: 'a',
            quantity: '1',
            customUnitPrice: '20',
            sellerStaffId: 'seller',
          },
        ],
      }),
    );
  });
  it('keeps an omitted transaction date stable across retries', () => {
    const dto = { items: request.items };
    vi.useFakeTimers();
    try {
      const before = saleRequestHash('location', dto);
      vi.advanceTimersByTime(60_000);
      expect(saleRequestHash('location', dto)).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each<Partial<CreateOrderDto>>([
    { clientId: 'new-client' },
    { note: 'Other' },
    { occurredAt: '2026-10-17T10:00:00Z' },
    { items: [{ ...request.items[0], quantity: '2' }, request.items[1]] },
    {
      items: [{ ...request.items[0], customUnitPrice: '21' }, request.items[1]],
    },
    {
      items: [
        { ...request.items[0], sellerStaffId: 'another-seller' },
        request.items[1],
      ],
    },
    { items: [request.items[0]] },
  ])('detects changed sale intent: %j', (patch) => {
    expect(saleRequestHash('location', { ...request, ...patch })).not.toBe(
      saleRequestHash('location', request),
    );
  });
  it('scopes request identity to its location', () => {
    expect(saleRequestHash('other', request)).not.toBe(
      saleRequestHash('location', request),
    );
  });
});
