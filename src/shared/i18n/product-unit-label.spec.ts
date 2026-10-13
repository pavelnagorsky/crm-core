import { ProductUnit } from '@prisma/client';
import { LocaleService } from './locale.service.js';
import { productUnitLabelOf } from './product-unit-label.js';

describe('productUnitLabelOf', () => {
  const locale = new LocaleService();
  locale.onModuleInit();
  const productUnits = locale.get().productUnit;

  it('formats product units with the full name and abbreviation', () => {
    expect(productUnitLabelOf(productUnits, ProductUnit.PIECE)).toBe(
      'штука (шт)',
    );
    expect(productUnitLabelOf(productUnits, ProductUnit.PIECE, 18)).toBe(
      'штук (шт)',
    );
    expect(
      `${18} ${productUnitLabelOf(productUnits, ProductUnit.PIECE, 18)}`,
    ).toBe('18 штук (шт)');
  });

  it('uses Russian plural forms for product units', () => {
    expect(productUnitLabelOf(productUnits, ProductUnit.LITER, 1)).toBe(
      'литр (л)',
    );
    expect(productUnitLabelOf(productUnits, ProductUnit.LITER, 2)).toBe(
      'литра (л)',
    );
    expect(productUnitLabelOf(productUnits, ProductUnit.LITER, 5)).toBe(
      'литров (л)',
    );
  });
});
