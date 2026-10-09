import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import {
  DEFAULT_LANG,
  LocaleService,
} from '../../../shared/i18n/locale.service.js';
import { labelOf } from '../../../shared/i18n/label-of.js';
import { I18nLocale } from '../../../shared/interfaces/i18n-locale.interface.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TimeService } from '../../../shared/time/time.service.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxSheet } from '../../../shared/xlsx/interfaces/xlsx-sheet.interface.js';
import { XlsxService } from '../../../shared/xlsx/xlsx.service.js';
import { LocationService } from '../../location/location.service.js';
import { InventoryReportQueryDto } from './dto/inventory-report-query.dto.js';
import { InventoryReportMovement } from './interfaces/inventory-report-movement.interface.js';
import { InventoryReportMovementRow } from './interfaces/inventory-report-movement-row.interface.js';
import { InventoryReportView } from './interfaces/inventory-report-view.interface.js';
import { InventoryTurnoverBucketRow } from './interfaces/inventory-turnover-bucket-row.interface.js';
import { InventoryTurnoverLine } from './interfaces/inventory-turnover-line.interface.js';
import {
  INVENTORY_MOVEMENT_COLUMNS,
  inventoryTurnoverLines,
  sumInventoryTurnoverLines,
} from './utils/inventory-turnover-lines.js';

@Injectable()
export class InventoryReportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly locale: LocaleService,
  ) {}

  async exportVedomost(
    locationId: string,
    dto: InventoryReportQueryDto,
    lang = DEFAULT_LANG,
  ): Promise<XlsxFile> {
    const report = await this.build(locationId, dto);
    const messages = this.locale.get(lang);
    const text = messages.documents.inventory;
    return XlsxService.write(
      `inventory-vedomost-${report.from}.xlsx`,
      (book) => {
        this.writeVedomost(book.addSheet(text.vedomostSheet), report, messages);
        this.writeMovements(
          book.addSheet(text.movementsSheet),
          report,
          messages,
        );
      },
    );
  }

  async build(
    locationId: string,
    dto: InventoryReportQueryDto,
  ): Promise<InventoryReportView> {
    this.assertPeriod(dto.from, dto.to);
    const location = await this.locations.findById(locationId);
    const { start, end } = this.bounds(dto.from, dto.to, location.timezone);
    const [buckets, movements] = await this.db.$transaction([
      this.db.$queryRaw<InventoryTurnoverBucketRow[]>(
        this.bucketQuery(locationId, start, end),
      ),
      this.db.$queryRaw<InventoryReportMovementRow[]>(
        this.movementQuery(locationId, start, end),
      ),
    ]);
    return {
      locationName: location.name,
      currency: location.currency,
      timezone: location.timezone,
      from: dto.from,
      to: dto.to,
      lines: inventoryTurnoverLines(buckets),
      movements: movements.map((row) => this.movement(row)),
    };
  }

  private writeVedomost(
    sheet: XlsxSheet,
    report: InventoryReportView,
    messages: I18nLocale,
  ): void {
    const inventory = messages.documents.inventory;
    const common = messages.documents.common;
    sheet.addRow([inventory.vedomostTitle]);
    sheet.addRow([common.location, report.locationName]);
    sheet.addRow([common.period, `${report.from} — ${report.to}`]);
    sheet.addRow([common.currency, report.currency]);
    sheet.addRow([]);
    sheet.addRow([
      inventory.product,
      inventory.sku,
      inventory.unit,
      inventory.openingQuantity,
      ...INVENTORY_MOVEMENT_COLUMNS.map((type) =>
        labelOf(messages.inventoryMovementType, type),
      ),
      inventory.closingQuantity,
      inventory.openingValue,
      inventory.periodValue,
      inventory.closingValue,
    ]);
    for (const line of report.lines) {
      sheet.addRow([
        line.name,
        line.sku ?? '',
        labelOf(messages.productUnit, line.unit),
        ...this.amountCells(line),
      ]);
    }
    sheet.addRow([]);
    sheet.addRow([
      common.total,
      '',
      '',
      ...this.amountCells(sumInventoryTurnoverLines(report.lines)),
    ]);
  }

  private writeMovements(
    sheet: XlsxSheet,
    report: InventoryReportView,
    messages: I18nLocale,
  ): void {
    const inventory = messages.documents.inventory;
    const common = messages.documents.common;
    sheet.addRow([inventory.movementsTitle]);
    sheet.addRow([common.period, `${report.from} — ${report.to}`]);
    sheet.addRow([]);
    sheet.addRow([
      common.date,
      common.type,
      inventory.product,
      inventory.sku,
      common.quantity,
      inventory.unitCost,
      common.amount,
      inventory.quantityBefore,
      inventory.quantityAfter,
      inventory.document,
      inventory.order,
    ]);
    for (const movement of report.movements) {
      sheet.addRow([
        this.formatOccurredAt(movement.occurredAt, report.timezone),
        labelOf(messages.inventoryMovementType, movement.type),
        movement.productName,
        movement.productSku ?? '',
        QuantityService.format(movement.quantityDelta),
        MoneyService.format(movement.unitCost),
        MoneyService.format(movement.totalCost),
        QuantityService.format(movement.quantityBefore),
        QuantityService.format(movement.quantityAfter),
        movement.documentReference ?? '',
        movement.orderId ?? '',
      ]);
    }
  }

  private amountCells(line: InventoryTurnoverLine): string[] {
    return [
      QuantityService.format(line.openingQuantity),
      ...INVENTORY_MOVEMENT_COLUMNS.map((type) =>
        QuantityService.format(line.quantities[type]),
      ),
      QuantityService.format(line.closingQuantity),
      MoneyService.format(line.openingValue),
      MoneyService.format(line.periodValue),
      MoneyService.format(line.closingValue),
    ];
  }

  private movement(row: InventoryReportMovementRow): InventoryReportMovement {
    return {
      occurredAt:
        row.occurredAt instanceof Date
          ? row.occurredAt
          : new Date(row.occurredAt),
      type: row.type,
      productName: row.productName,
      productSku: row.productSku,
      quantityDelta: QuantityService.decimal(row.quantityDelta),
      unitCost: MoneyService.decimal(row.unitCost),
      totalCost: MoneyService.decimal(row.totalCost),
      quantityBefore: QuantityService.decimal(row.quantityBefore),
      quantityAfter: QuantityService.decimal(row.quantityAfter),
      documentReference: row.documentReference,
      orderId: row.orderId,
    };
  }

  private bucketQuery(locationId: string, start: Date, end: Date): Prisma.Sql {
    return Prisma.sql`
      SELECT
        rows."productLocationId",
        rows.name,
        rows.sku,
        rows.unit,
        rows.bucket,
        SUM(rows.quantity) AS quantity,
        SUM(rows.value) AS value
      FROM (
        SELECT
          im."productLocationId" AS "productLocationId",
          p.name AS name,
          p.sku AS sku,
          p.unit AS unit,
          CASE
            WHEN im."occurredAt" < ${start} THEN 'OPENING'
            ELSE im."type"::text
          END AS bucket,
          im."quantityDelta" AS quantity,
          im."totalCost" AS value
        FROM "InventoryMovement" im
        INNER JOIN "ProductLocation" pl ON pl.id = im."productLocationId"
        INNER JOIN "Product" p ON p.id = pl."productId"
        WHERE im."locationId" = ${locationId}
          AND im."occurredAt" < ${end}
      ) rows
      GROUP BY
        rows."productLocationId",
        rows.name,
        rows.sku,
        rows.unit,
        rows.bucket
    `;
  }

  private movementQuery(
    locationId: string,
    start: Date,
    end: Date,
  ): Prisma.Sql {
    return Prisma.sql`
      SELECT
        im."occurredAt" AS "occurredAt",
        im."type"::text AS type,
        im."productName" AS "productName",
        im."productSku" AS "productSku",
        im."quantityDelta" AS "quantityDelta",
        im."unitCost" AS "unitCost",
        im."totalCost" AS "totalCost",
        im."quantityBefore" AS "quantityBefore",
        im."quantityAfter" AS "quantityAfter",
        d."reference" AS "documentReference",
        im."orderId" AS "orderId"
      FROM "InventoryMovement" im
      LEFT JOIN "InventoryDocument" d ON d.id = im."documentId"
      WHERE im."locationId" = ${locationId}
        AND im."occurredAt" >= ${start}
        AND im."occurredAt" < ${end}
      ORDER BY im."occurredAt" ASC, im."id" ASC
    `;
  }

  private assertPeriod(from: string, to: string): void {
    if (!this.isCalendarDate(from) || !this.isCalendarDate(to) || to < from) {
      throw new AppException(
        ErrorCode.INVENTORY_REPORT_PERIOD_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private isCalendarDate(value: string): boolean {
    if (!regularExpressions.calendarDate.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
    );
  }

  private bounds(from: string, to: string, timezone: string) {
    const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
    const [toYear, toMonth, toDay] = to.split('-').map(Number);
    return {
      start: TimeService.zonedDayStart(fromYear, fromMonth, fromDay, timezone),
      end: TimeService.addDaysInTz(
        TimeService.zonedDayStart(toYear, toMonth, toDay, timezone),
        1,
        timezone,
      ),
    };
  }

  private formatOccurredAt(date: Date, timezone: string): string {
    const parts = TimeService.toZonedParts(date, timezone);
    const hour = String(parts.hour).padStart(2, '0');
    const minute = String(parts.minute).padStart(2, '0');
    const second = String(parts.second).padStart(2, '0');
    return `${TimeService.zonedDateStr(date, timezone)} ${hour}:${minute}:${second}`;
  }
}
