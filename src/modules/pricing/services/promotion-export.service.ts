import { Injectable } from '@nestjs/common';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { LocationService } from '../../location/services/location.service.js';
import { XlsxColumn } from '../../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import {
  PROMOTION_NOT_RETURNED_COLUMNS,
  PROMOTION_NOT_RETURNED_FILE,
  PROMOTION_NOT_RETURNED_SHEET,
} from '../constants/promotion-export.constants.js';
import { PromotionNotReturnedRow } from '../interfaces/promotion-not-returned-row.interface.js';
import { PromotionNotReturnedXlsxRow } from '../interfaces/promotion-not-returned-xlsx-row.interface.js';

const COLUMNS: XlsxColumn<PromotionNotReturnedXlsxRow>[] = [
  { header: PROMOTION_NOT_RETURNED_COLUMNS.name, key: 'name', width: 28 },
  { header: PROMOTION_NOT_RETURNED_COLUMNS.phone, key: 'phone', width: 18 },
  { header: PROMOTION_NOT_RETURNED_COLUMNS.email, key: 'email', width: 28 },
  { header: PROMOTION_NOT_RETURNED_COLUMNS.visitAt, key: 'visitAt', width: 18 },
  { header: PROMOTION_NOT_RETURNED_COLUMNS.staff, key: 'staff', width: 24 },
  { header: PROMOTION_NOT_RETURNED_COLUMNS.services, key: 'services', width: 36 },
];

/** Excel exports of the promotion page, the way the other exports of the repository build them. */
@Injectable()
export class PromotionExportService {
  constructor(private readonly locations: LocationService) {}

  /** Clients who did not book again after a promotion visit; visit time in the location zone. */
  async notReturned(
    locationId: string,
    rows: readonly PromotionNotReturnedRow[],
  ): Promise<XlsxFile> {
    const { timezone } = await this.locations.getBookingSettings(locationId);
    return XlsxUtils.table(
      rows.map((row) => ({
        name: row.name,
        phone: row.phone ?? '',
        email: row.email ?? '',
        visitAt: TimeUtils.zonedDateTimeStr(row.visitAt, timezone),
        staff: row.staffNames.join(', '),
        services: row.serviceTitles.join(', '),
      })),
      COLUMNS,
      PROMOTION_NOT_RETURNED_FILE,
      PROMOTION_NOT_RETURNED_SHEET,
      timezone,
    );
  }
}
