import { catalogCategoryMatch, catalogItemMatch } from './catalog-item-filter.js';

describe('catalog item filters', () => {
  it('matches a service only when the booking was sold as that service', () => {
    expect(catalogItemMatch(['cut'])).toEqual({
      OR: [
        { bundleId: null, items: { some: { serviceId: { in: ['cut'] } } } },
        { bundleId: { in: ['cut'] } },
      ],
    });
  });

  it('matches a category on the sold service or the sold bundle', () => {
    expect(catalogCategoryMatch('hair')).toEqual({
      OR: [
        { bundleId: null, items: { some: { service: { categoryId: 'hair' } } } },
        { bundle: { categoryId: 'hair' } },
      ],
    });
  });
});
