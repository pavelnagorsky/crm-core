import { buildProductUpcoming } from './product-price-upcoming.rules.js';

describe('buildProductUpcoming', () => {
  const current = new Map([
    ['pl-a', { productId: 'a', price: 5500 }],
    ['pl-b', { productId: 'b', price: 1000 }],
  ]);

  it('gives the nearest future date and the nearest price of each product', () => {
    const view = buildProductUpcoming(
      [
        { id: 'past', effectiveDate: '2026-11-25', items: [{ productLocationId: 'pl-a', afterPrice: 1 }] },
        { id: 'c1', effectiveDate: '2027-01-01', items: [{ productLocationId: 'pl-a', afterPrice: 6000 }] },
        {
          id: 'c2',
          effectiveDate: '2027-01-01',
          items: [
            { productLocationId: 'pl-b', afterPrice: 1000 },
            { productLocationId: 'pl-gone', afterPrice: 10 },
          ],
        },
        { id: 'c3', effectiveDate: '2027-02-01', items: [{ productLocationId: 'pl-b', afterPrice: 1200 }] },
      ],
      current,
      '2026-11-25',
    );
    expect(view.next).toEqual({
      effectiveDate: '2027-01-01',
      changeIds: ['c1', 'c2'],
      changesCount: 2,
      productsCount: 3,
    });
    // b: the nearest price equals the current one, so it is no hint.
    expect(view.products).toEqual([
      { productId: 'a', changeId: 'c1', effectiveDate: '2027-01-01', price: 6000 },
    ]);
  });

  it('no future changes: no hints', () => {
    expect(buildProductUpcoming([], current, '2026-11-25')).toEqual({
      next: null,
      products: [],
    });
  });
});
