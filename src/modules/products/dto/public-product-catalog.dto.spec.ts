import {
  Prisma,
  ProductCategory,
  ProductStatus,
  ProductUnit,
} from '@prisma/client';
import { PublicCatalogProduct } from '../interfaces/public-catalog-product.interface.js';
import { PublicProductCatalogDto } from './public-product-catalog.dto.js';

const date = new Date('2026-10-22T00:00:00Z');

function category(id: string, sortOrder = 0): ProductCategory {
  return {
    id,
    brandId: 'brand',
    name: id,
    description: 'Category description',
    sortOrder,
    createdAt: date,
    updatedAt: date,
  };
}

function product(
  id: string,
  group: ProductCategory | null,
): PublicCatalogProduct {
  return {
    id: 'location-product-' + id,
    locationId: 'location',
    productId: id,
    retailPrice: new Prisma.Decimal('12.30'),
    status: ProductStatus.ACTIVE,
    trackInventory: true,
    reorderLevel: new Prisma.Decimal('10'),
    createdAt: date,
    updatedAt: date,
    product: {
      id,
      brandId: 'brand',
      categoryId: group?.id ?? null,
      category: group,
      imageFileId: null,
      imageFile: null,
      name: 'Shampoo',
      description: 'Product description',
      sku: 'internal-sku',
      barcode: 'internal-barcode',
      status: ProductStatus.ACTIVE,
      unit: ProductUnit.PIECE,
      createdAt: date,
      updatedAt: date,
    },
  };
}

describe('PublicProductCatalogDto', () => {
  it('returns an empty catalog for a location without products', () => {
    expect(PublicProductCatalogDto.fromEntities([])).toEqual({
      categories: [],
      items: [],
    });
  });

  it('deduplicates and orders only represented categories and preserves uncategorized products', () => {
    const last = category('last', 10);
    const result = PublicProductCatalogDto.fromEntities([
      product('1', last),
      product('2', category('B')),
      product('3', last),
      product('4', null),
      product('5', category('A')),
    ]);
    expect(result.categories.map((item) => item.id)).toEqual([
      'A',
      'B',
      'last',
    ]);
    expect(result.categories[0]).toEqual({
      id: 'A',
      name: 'A',
      description: 'Category description',
    });
    expect(result.items.map((item) => item.productId)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(result.items[3].categoryId).toBeNull();
  });

  it('maps photo and description and exposes only public product fields', () => {
    const row = product('1', category('care'));
    row.product.imageFileId = 'image';
    row.product.imageFile = {
      id: 'image',
      fileName: 'shampoo.webp',
      url: 'https://example.com/shampoo.webp',
      mimeType: 'image/webp',
      fileSizeBytes: 1024,
      storageKey: 'private-storage-key',
      userId: 'owner',
      createdAt: date,
    };
    expect(PublicProductCatalogDto.fromEntities([row]).items).toEqual([
      {
        productId: '1',
        name: 'Shampoo',
        description: 'Product description',
        categoryId: 'care',
        image: {
          id: 'image',
          name: 'shampoo.webp',
          url: 'https://example.com/shampoo.webp',
        },
        unit: 'PIECE',
        retailPrice: '12.30',
      },
    ]);
  });

  it('preserves missing descriptions and photos as null', () => {
    const row = product('1', null);
    row.product.description = null;
    expect(PublicProductCatalogDto.fromEntities([row]).items[0]).toMatchObject({
      description: null,
      image: null,
      categoryId: null,
    });
  });
});
