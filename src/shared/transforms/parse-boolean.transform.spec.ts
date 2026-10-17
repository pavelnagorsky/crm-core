import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LocationProductSearchRequestDto } from '../../modules/products/dto/location-product-search-request.dto.js';
import { SupplierSearchRequestDto } from '../../modules/suppliers/dto/supplier-search-request.dto.js';
import { PaginationRequestDto } from '../dto/pagination-request.dto.js';

describe('Boolean query parameters', () => {
  it.each(['false', 'FALSE', false])(
    'keeps %j false for pagination and filters',
    async (value) => {
      const page = plainToInstance(PaginationRequestDto, { isExport: value });
      const suppliers = plainToInstance(SupplierSearchRequestDto, {
        isActive: value,
      });
      const products = plainToInstance(LocationProductSearchRequestDto, {
        trackInventory: value,
      });
      expect(page.isExport).toBe(false);
      expect(suppliers.isActive).toBe(false);
      expect(products.trackInventory).toBe(false);
      expect(await validate(page)).toEqual([]);
    },
  );

  it.each(['true', 'TRUE', true])('accepts %j as true', async (value) => {
    const page = plainToInstance(PaginationRequestDto, { isExport: value });
    expect(page.isExport).toBe(true);
    expect(await validate(page)).toEqual([]);
  });

  it.each(['', 'yes', '0', '1', 0, 1, [], {}])(
    'rejects malformed boolean %j',
    async (value) => {
      const page = plainToInstance(PaginationRequestDto, { isExport: value });
      expect(await validate(page)).toEqual([
        expect.objectContaining({ property: 'isExport' }),
      ]);
    },
  );
});
