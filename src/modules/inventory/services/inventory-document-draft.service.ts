import { HttpStatus, Injectable } from '@nestjs/common';
import {
  InventoryDocumentItem,
  InventoryDocumentType,
  Prisma,
} from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/location.service.js';
import { ProductsService } from '../../products/products.service.js';
import { ProductPackagingService } from '../../products/services/product-packaging.service.js';
import { SuppliersService } from '../../suppliers/suppliers.service.js';
import { CreateInventoryDocumentDto } from '../dto/create-inventory-document.dto.js';
import { InventoryDocumentDraft } from '../interfaces/inventory-document-draft.interface.js';
import { InventoryPackaging } from '../interfaces/inventory-packaging.interface.js';
import { InventoryDocumentItemComputeService } from './inventory-document-item-compute.service.js';

@Injectable()
export class InventoryDocumentDraftService {
  constructor(
    private readonly products: ProductsService,
    private readonly packagings: ProductPackagingService,
    private readonly suppliers: SuppliersService,
    private readonly locations: LocationService,
    private readonly itemCompute: InventoryDocumentItemComputeService,
  ) {}

  async prepare(
    locationId: string,
    brandId: string,
    dto: CreateInventoryDocumentDto,
    existingItems: InventoryDocumentItem[] = [],
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryDocumentDraft> {
    if (new Date(dto.occurredAt).getTime() > Date.now()) {
      throw new AppException(
        ErrorCode.INVENTORY_FUTURE_DATE,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      (dto.type === InventoryDocumentType.WRITE_OFF ||
        dto.type === InventoryDocumentType.ADJUSTMENT) &&
      !dto.reason?.trim()
    ) {
      throw new AppException(
        ErrorCode.INVENTORY_REASON_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    if (dto.type === InventoryDocumentType.TRANSFER) {
      if (
        !dto.destinationLocationId ||
        dto.destinationLocationId === locationId
      )
        this.invalidDestination();
      const destination = await this.locations.findById(
        dto.destinationLocationId!,
        tx,
      );
      if (destination.brandId !== brandId) this.invalidDestination();
      const destinationProducts = await this.products.resolveForInventory(
        dto.destinationLocationId!,
        productIds,
        tx,
      );
      if (destinationProducts.length !== productIds.length)
        this.notConfigured();
    } else if (dto.destinationLocationId) this.invalidDestination();
    const products = await this.products.resolveForInventory(
      locationId,
      productIds,
      tx,
    );
    if (products.length !== productIds.length) this.notConfigured();
    const byProduct = new Map(products.map((row) => [row.productId, row]));
    const byPackaging = this.packagingSnapshots(existingItems);
    const packagingIds = [
      ...new Set(
        dto.items.flatMap((item) =>
          item.packagingId && !byPackaging.has(item.packagingId)
            ? [item.packagingId]
            : [],
        ),
      ),
    ];
    const packagings = packagingIds.length
      ? await this.packagings.resolveForReceipt(brandId, packagingIds, tx)
      : [];
    for (const packaging of packagings)
      byPackaging.set(packaging.id, packaging);
    let supplierId: string | null = null;
    let supplierName: string | null = dto.supplierName?.trim() || null;
    if (dto.supplierId) {
      const supplier = await this.suppliers.resolveActiveForDocument(
        brandId,
        dto.supplierId,
        tx,
      );
      supplierId = supplier.id;
      supplierName = supplier.name;
    }
    const items = dto.items.map((item, position) => {
      const row = byProduct.get(item.productId)!;
      return {
        productLocationId: row.id,
        productId: row.productId,
        productName: row.product.name,
        productSku: row.product.sku,
        productUnit: row.product.unit,
        position,
        ...this.itemCompute.normalize(
          dto.type,
          item,
          row.product.unit,
          item.packagingId ? byPackaging.get(item.packagingId) : undefined,
        ),
      };
    });
    return { items, supplierId, supplierName };
  }

  private packagingSnapshots(
    items: InventoryDocumentItem[],
  ): Map<string, InventoryPackaging> {
    const snapshots = new Map<string, InventoryPackaging>();
    for (const item of items) {
      if (
        item.packagingId == null ||
        item.packagingName == null ||
        item.packagingFactor == null
      )
        continue;
      snapshots.set(item.packagingId, {
        id: item.packagingId,
        productId: item.productId,
        name: item.packagingName,
        quantityInBaseUnit: item.packagingFactor,
      });
    }
    return snapshots;
  }

  private invalidDestination(): never {
    throw new AppException(
      ErrorCode.INVENTORY_DESTINATION_INVALID,
      HttpStatus.BAD_REQUEST,
    );
  }

  private notConfigured(): never {
    throw new AppException(
      ErrorCode.INVENTORY_PRODUCT_NOT_CONFIGURED,
      HttpStatus.BAD_REQUEST,
    );
  }
}
