import { Injectable } from '@nestjs/common';
import { InventoryMovement } from '@prisma/client';
import {
  DEFAULT_LANG,
  LocaleService,
} from '../../../shared/i18n/locale.service.js';
import { labelOf } from '../../../shared/i18n/label-of.js';
import { productUnitLabelOf } from '../../../shared/i18n/product-unit-label.js';
import { I18nLocale } from '../../../shared/interfaces/i18n-locale.interface.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
import { XlsxColumn } from '../../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxService } from '../../../shared/xlsx/xlsx.service.js';
import { LocationService } from '../../location/location.service.js';
import { InventoryExportRequestDto } from '../dto/inventory-export-request.dto.js';
import { InventoryMovementExportRequestDto } from '../dto/inventory-movement-export-request.dto.js';
import { InventoryBalanceView } from '../interfaces/inventory-balance-view.interface.js';
import { InventoryService } from '../inventory.service.js';

type InventoryBalanceRow = {
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  quantityOnHand: string;
  averageUnitCost: string;
  stockValue: string;
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
    private readonly inventory: InventoryService,
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
      { header: inventory.reorderLevel, key: 'reorderLevel' },
      { header: inventory.lowStock, key: 'lowStock' },
      { header: inventory.outOfStock, key: 'outOfStock' },
      { header: inventory.updatedAt, key: 'updatedAt' },
    ];
    const { items } = await this.inventory.searchInventory(locationId, {
      ...dto,
      isExport: true,
    });
    return XlsxService.table(
      items.map((item) => this.toRow(item, messages)),
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
      { header: inventory.unitCost, key: 'unitCost' },
      { header: common.amount, key: 'totalCost' },
      { header: inventory.quantityBefore, key: 'quantityBefore' },
      { header: inventory.quantityAfter, key: 'quantityAfter' },
      { header: inventory.document, key: 'documentId' },
      { header: inventory.order, key: 'orderId' },
      { header: common.id, key: 'id' },
      { header: common.createdAt, key: 'createdAt' },
    ];
    const { items } = await this.inventory.searchMovements(
      locationId,
      productId,
      {
        ...dto,
        isExport: true,
      },
    );
    return XlsxService.table(
      items.map((item) => this.toMovementRow(item, messages)),
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

    return XlsxService.write(`inventory-statement-${day}.xlsx`, (book) => {
      const sheet = book.addSheet(inventory.inventoryStatementSheet);
      sheet.addRow([inventory.inventoryStatementTitle]);
      sheet.addRow([common.location, location.name]);
      sheet.addRow([common.date, day]);
      sheet.addRow([]);
      sheet.addRow([
        '№',
        inventory.product,
        inventory.sku,
        inventory.baseUnit,
        inventory.accountingQuantity,
        inventory.actualQuantity,
      ]);
      items.forEach((item, index) => {
        sheet.addRow([
          index + 1,
          item.name,
          item.sku ?? '',
          productUnitLabelOf(messages.productUnit, item.unit),
          QuantityService.format(item.quantityOnHand),
          '',
        ]);
      });
      sheet.addRow([]);
      sheet.addRow([
        inventory.responsibleAutomation,
        '',
        '',
        inventory.signature,
      ]);
      sheet.addRow([
        inventory.responsibleWarehouse,
        '',
        '',
        inventory.signature,
      ]);
    });
  }

  private toRow(
    item: InventoryBalanceView,
    messages: I18nLocale,
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
      quantityOnHand: QuantityService.format(item.quantityOnHand),
      averageUnitCost: MoneyService.format(item.averageUnitCost),
      stockValue: MoneyService.format(item.stockValue),
      reorderLevel: QuantityService.format(item.reorderLevel),
      lowStock: item.lowStock ? inventory.yes : inventory.no,
      outOfStock: item.outOfStock ? inventory.yes : inventory.no,
      updatedAt: item.updatedAt ?? '',
    };
  }

  private toMovementRow(
    item: InventoryMovement,
    messages: I18nLocale,
  ): InventoryMovementRow {
    return {
      occurredAt: item.occurredAt.toISOString(),
      type: labelOf(messages.inventoryMovementType, item.type),
      productName: item.productName,
      productSku: item.productSku ?? '',
      quantityDelta: QuantityService.format(item.quantityDelta),
      unitCost: MoneyService.format(item.unitCost),
      totalCost: MoneyService.format(item.totalCost),
      quantityBefore: QuantityService.format(item.quantityBefore),
      quantityAfter: QuantityService.format(item.quantityAfter),
      documentId: item.documentId ?? '',
      orderId: item.orderId ?? '',
      id: item.id,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
