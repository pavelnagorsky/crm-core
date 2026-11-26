import { Injectable } from '@nestjs/common';
import { PriceChangeCatalog } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import {
  SERVICE_PRICE_FILE_PREFIX,
  SERVICE_PRICE_SHEET_NAME,
  SERVICE_PRICE_STAFF_SHEET_NAME,
  SERVICE_PRICE_TEMPLATE_FILE,
} from '../constants/service-price-import.constants.js';
import { ServicePriceExportSheets } from '../interfaces/service-price-export-sheets.interface.js';
import { writePriceExportSnapshot } from '../rules/price-export-snapshot.rules.js';
import {
  buildServicePriceExport,
  buildServicePriceTemplate,
} from '../rules/service-price-export.rules.js';
import { PriceLevelReadService } from './price-level-read.service.js';

/**
 * The price file: the current prices (export) and the empty example (template). The export also
 * keeps its prices in a very hidden sheet, so the upload changes only the cells people edited.
 */
@Injectable()
export class ServicePriceExportService {
  constructor(
    private readonly catalog: ServiceCatalogFacade,
    private readonly levels: PriceLevelReadService,
    private readonly staff: StaffService,
    private readonly locations: LocationService,
  ) {}

  async export(locationId: string, now = new Date()): Promise<XlsxFile> {
    const [catalog, levels, levelPrices, assignments, settings] =
      await Promise.all([
        this.catalog.loadPriceCatalog(locationId),
        this.levels.listLevels(locationId),
        this.levels.listLevelPrices(locationId),
        this.staff.listActiveAssignments(locationId),
        this.locations.getBookingSettings(locationId),
      ]);
    const day = TimeUtils.zonedDateStr(now, settings.timezone);
    return this.write(
      `${SERVICE_PRICE_FILE_PREFIX}-${day}.xlsx`,
      buildServicePriceExport({ catalog, levels, levelPrices, assignments }),
      locationId,
      now,
    );
  }

  async template(locationId: string): Promise<XlsxFile> {
    const levels = await this.levels.listLevels(locationId);
    return this.write(
      SERVICE_PRICE_TEMPLATE_FILE,
      buildServicePriceTemplate(levels),
      locationId,
      new Date(),
    );
  }

  private write(
    filename: string,
    sheets: ServicePriceExportSheets,
    locationId: string,
    now: Date,
  ): XlsxFile {
    return XlsxUtils.write(filename, (book) => {
      const prices = book.addSheet(SERVICE_PRICE_SHEET_NAME);
      prices.setColumns(sheets.priceColumns);
      for (const row of sheets.priceRows) prices.addRow(row);
      const staff = book.addSheet(SERVICE_PRICE_STAFF_SHEET_NAME);
      staff.setColumns(sheets.staffColumns);
      for (const row of sheets.staffRows) staff.addRow(row);
      if (sheets.exported)
        writePriceExportSnapshot(book, {
          catalog: PriceChangeCatalog.SERVICES,
          locationId,
          exportedAt: now.toISOString(),
          values: sheets.exported,
        });
    });
  }
}
