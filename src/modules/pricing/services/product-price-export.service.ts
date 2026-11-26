import { Injectable } from '@nestjs/common';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { InventoryFacade } from '../../inventory/inventory.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { ProductsService } from '../../products/services/products.service.js';
import {
  PRODUCT_PRICE_FILE_PREFIX,
  PRODUCT_PRICE_SHEET_NAME,
  PRODUCT_PRICE_TEMPLATE_FILE,
} from '../constants/product-price-import.constants.js';
import { buildProductPriceSheet } from '../rules/product-price-export.rules.js';

/**
 * The product price file: the retail prices of the products the location sells. The template
 * is the same sheet under another name: the rows carry the IDs the upload needs, and the
 * upload cannot create products.
 */
@Injectable()
export class ProductPriceExportService {
  constructor(
    private readonly products: ProductsService,
    private readonly inventory: InventoryFacade,
    private readonly locations: LocationService,
  ) {}

  async export(locationId: string, withCost: boolean): Promise<XlsxFile> {
    const { timezone } = await this.locations.getLocale(locationId);
    const day = TimeUtils.zonedDateStr(new Date(), timezone);
    return this.write(
      locationId,
      `${PRODUCT_PRICE_FILE_PREFIX}-${day}.xlsx`,
      withCost,
    );
  }

  template(locationId: string, withCost: boolean): Promise<XlsxFile> {
    return this.write(locationId, PRODUCT_PRICE_TEMPLATE_FILE, withCost);
  }

  private async write(
    locationId: string,
    filename: string,
    withCost: boolean,
  ): Promise<XlsxFile> {
    const products = await this.products.listPriced(locationId);
    const costs = withCost
      ? await this.inventory.lastPurchaseUnitCosts(
          locationId,
          products.map((product) => product.productLocationId),
        )
      : new Map();
    const sheet = buildProductPriceSheet(products, costs, withCost);
    return XlsxUtils.write(filename, (book) => {
      const prices = book.addSheet(PRODUCT_PRICE_SHEET_NAME);
      prices.setColumns(sheet.columns);
      for (const row of sheet.rows) prices.addRow(row);
    });
  }
}
