import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
import { PublicProductsController } from './public-products.controller.js';

describe('PublicProductsController', () => {
  it('returns the standard API envelope without authentication', async () => {
    const products = { listForPublicCatalog: vi.fn().mockResolvedValue([]) };
    const controller = new PublicProductsController(products as never);
    expect(await controller.catalog('location')).toMatchObject({
      isSuccess: true,
      responseValue: { categories: [], items: [] },
    });
    expect(products.listForPublicCatalog).toHaveBeenCalledWith('location');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PublicProductsController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(GUARDS_METADATA, controller.catalog),
    ).toBeUndefined();
  });

  it('propagates unavailable locations as 404', async () => {
    const products = {
      listForPublicCatalog: vi.fn().mockRejectedValue(new NotFoundException()),
    };
    const controller = new PublicProductsController(products as never);
    await expect(controller.catalog('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
