import { Injectable } from '@nestjs/common';
import { InventoryMovement } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { labelOf } from '../../../../shared/i18n/label-of.js';
import {
  DEFAULT_LANG,
  LocaleService,
} from '../../../../shared/i18n/locale.service.js';
import { productUnitLabelOf } from '../../../../shared/i18n/product-unit-label.js';
import { I18nLocale } from '../../../../shared/interfaces/i18n-locale.interface.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../../shared/quantity/quantity.utils.js';
import { XlsxColumn } from '../../../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { LocationService } from '../../../location/services/location.service.js';
import { InventoryExportRequestDto } from '../dto/inventory-export-request.dto.js';
import { InventoryMovementExportRequestDto } from '../dto/inventory-movement-export-request.dto.js';
import { InventoryBalanceView } from '../../interfaces/inventory-balance-view.interface.js';
import { InventoryFacade } from '../../inventory.facade.js';

type InventoryBalanceRow = {
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  quantityOnHand: string;
  averageUnitCost: string;
  stockValue: string;
  currency: string;
  reorderLevel: string;
  lowStock: string;
  outOfStock: string;
  updatedAt: Date | string;
};

type InventoryMovementRow = {
  occurredAt: string;
  type: string;
  productName: string;
  productSku: string;
  quantityDelta: string;
  unitCost: string;
  totalCost: string;
  currency: string;
  quantityBefore: string;
  quantityAfter: string;
  documentId: string;
  orderId: string;
  id: string;
  createdAt: string;
};

@Injectable()
export class InventoryExportService {
  constructor(
    private readonly inventory: InventoryFacade,
    private readonly locations: LocationService,
    private readonly locale: LocaleService,
  ) {}

  async stream(
    locationId: string,
    dto: InventoryExportRequestDto,
    lang = DEFAULT_LANG,
  ): Promise<XlsxFile> {
    const messages = this.locale.get(lang);
    const inventory = messages.documents.inventory;
    const columns: XlsxColumn<InventoryBalanceRow>[] = [
      { header: inventory.product, key: 'name' },
      { header: inventory.sku, key: 'sku' },
      { header: inventory.barcode, key: 'barcode' },
      { header: inventory.unit, key: 'unit' },
      { header: inventory.quantityOnHand, key: 'quantityOnHand' },
      { header: inventory.averageUnitCost, key: 'averageUnitCost' },
      { header: inventory.stockValue, key: 'stockValue' },
      { header: messages.documents.common.currency, key: 'currency' },
      { header: inventory.reorderLevel, key: 'reorderLevel' },
      { header: inventory.lowStock, key: 'lowStock' },
      { header: inventory.outOfStock, key: 'outOfStock' },
      { header: inventory.updatedAt, key: 'updatedAt' },
    ];
    const [location, { items }] = await Promise.all([
      this.locations.findById(locationId),
      this.inventory.searchInventory(locationId, {
        ...dto,
        isExport: true,
      }),
    ]);
    return XlsxUtils.table(
      items.map((item) => this.toRow(item, messages, location.currency)),
      columns,
      'inventory-balances',
      inventory.balancesSheet,
    );
  }

  async streamMovements(
    locationId: string,
    productId: string,
    dto: InventoryMovementExportRequestDto,
    lang = DEFAULT_LANG,
  ): Promise<XlsxFile> {
    const messages = this.locale.get(lang);
    const inventory = messages.documents.inventory;
    const common = messages.documents.common;
    const columns: XlsxColumn<InventoryMovementRow>[] = [
      { header: common.date, key: 'occurredAt' },
      { header: common.type, key: 'type' },
      { header: inventory.product, key: 'productName' },
      { header: inventory.sku, key: 'productSku' },
      { header: common.quantity, key: 'quantityDelta' },
      { header: inventory.accountingUnitCost, key: 'unitCost' },
      { header: inventory.accountingCost, key: 'totalCost' },
      { header: common.currency, key: 'currency' },
      { header: inventory.balanceBefore, key: 'quantityBefore' },
      { header: inventory.balanceAfter, key: 'quantityAfter' },
      { header: inventory.document, key: 'documentId' },
      { header: inventory.order, key: 'orderId' },
      { header: common.id, key: 'id' },
      { header: common.createdAt, key: 'createdAt' },
    ];
    const [location, { items }] = await Promise.all([
      this.locations.findById(locationId),
      this.inventory.searchMovements(locationId, productId, {
        ...dto,
        isExport: true,
      }),
    ]);
    return XlsxUtils.table(
      items.map((item) =>
        this.toMovementRow(item, messages, location.currency),
      ),
      columns,
      'inventory-movements',
      inventory.movementsSheet,
    );
  }

  async streamInventoryStatement(
    locationId: string,
    lang = DEFAULT_LANG,
  ): Promise<XlsxFile> {
    const messages = this.locale.get(lang);
    const inventory = messages.documents.inventory;
    const common = messages.documents.common;
    const day = new Date().toISOString().slice(0, 10);
    const [location, { items }] = await Promise.all([
      this.locations.findById(locationId),
      this.inventory.searchInventory(locationId, {
        page: 1,
        pageSize: 1,
        isExport: true,
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(inventory.inventoryStatementSheet);
    sheet.columns = [
      { width: 6 },
      { width: 34 },
      { width: 18 },
      { width: 12 },
      { width: 18 },
      { width: 18 },
    ];

    sheet.mergeCells('A1:F1');
    const title = sheet.getCell('A1');
    title.value = inventory.inventoryStatementTitle;
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 24;

    sheet.getCell('A2').value = common.location;
    sheet.getCell('B2').value = location.name;
    sheet.getCell('A3').value = common.date;
    sheet.getCell('B3').value = day;
    sheet.getCell('A2').font = { bold: true };
    sheet.getCell('A3').font = { bold: true };

    sheet.addRow([]);
    const header = sheet.addRow([
      '№',
      inventory.product,
      inventory.sku,
      inventory.baseUnit,
      inventory.accountingQuantity,
      inventory.actualQuantity,
    ]);
    header.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEDEFF3' },
      };
    });
    this.applyInventoryStatementTableStyle(header);

    items.forEach((item, index) => {
      const row = sheet.addRow([
        index + 1,
        item.name,
        item.sku ?? '',
        productUnitLabelOf(messages.productUnit, item.unit),
        QuantityUtils.format(item.quantityOnHand),
        '',
      ]);
      this.applyInventoryStatementTableStyle(row);
    });

    sheet.addRow([]);
    this.addSignatureRow(
      sheet.addRow([
        inventory.responsibleAutomation,
        '',
        '',
        inventory.signature,
        '',
        '',
      ]),
    );
    this.addSignatureRow(
      sheet.addRow([
        inventory.responsibleWarehouse,
        '',
        '',
        inventory.signature,
        '',
        '',
      ]),
    );

    return this.workbookFile(workbook, `inventory-statement-${day}.xlsx`);
  }

  private toRow(
    item: InventoryBalanceView,
    messages: I18nLocale,
    currency: string,
  ): InventoryBalanceRow {
    const inventory = messages.documents.inventory;
    return {
      name: item.name,
      sku: item.sku ?? '',
      barcode: item.barcode ?? '',
      unit: productUnitLabelOf(
        messages.productUnit,
        item.unit,
        item.quantityOnHand,
      ),
      quantityOnHand: QuantityUtils.format(item.quantityOnHand),
      averageUnitCost: MoneyUtils.format(item.averageUnitCost),
      stockValue: MoneyUtils.format(item.stockValue),
      currency,
      reorderLevel: QuantityUtils.format(item.reorderLevel),
      lowStock: item.lowStock ? inventory.yes : inventory.no,
      outOfStock: item.outOfStock ? inventory.yes : inventory.no,
      updatedAt: item.updatedAt ?? '',
    };
  }

  private toMovementRow(
    item: InventoryMovement,
    messages: I18nLocale,
    currency: string,
  ): InventoryMovementRow {
    return {
      occurredAt: item.occurredAt.toISOString(),
      type: labelOf(messages.inventoryMovementType, item.type),
      productName: item.productName,
      productSku: item.productSku ?? '',
      quantityDelta: QuantityUtils.format(item.quantityDelta),
      unitCost: MoneyUtils.format(item.unitCost),
      totalCost: MoneyUtils.format(item.totalCost),
      currency,
      quantityBefore: QuantityUtils.format(item.quantityBefore),
      quantityAfter: QuantityUtils.format(item.quantityAfter),
      documentId: item.documentId ?? '',
      orderId: item.orderId ?? '',
      id: item.id,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private applyInventoryStatementTableStyle(row: ExcelJS.Row): void {
    for (let column = 1; column <= 6; column += 1) {
      const cell = row.getCell(column);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: column === 2 || column === 3 ? 'left' : 'center',
        wrapText: true,
      };
    }
  }

  private addSignatureRow(row: ExcelJS.Row): void {
    row.height = 26;
    row.getCell(1).font = { bold: true };
    row.getCell(4).alignment = { horizontal: 'right', vertical: 'bottom' };
    for (const column of [2, 3, 5, 6]) {
      row.getCell(column).border = { bottom: { style: 'medium' } };
    }
  }

  private workbookFile(workbook: ExcelJS.Workbook, filename: string): XlsxFile {
    const stream = new PassThrough();
    void workbook.xlsx
      .write(stream)
      .then(() => stream.end())
      .catch((error: unknown) => stream.destroy(error as Error));
    return { stream, filename };
  }
}
