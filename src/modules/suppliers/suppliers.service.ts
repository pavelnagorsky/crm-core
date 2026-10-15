import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Supplier } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { SupplierOptionsRequestDto } from './dto/supplier-options-request.dto.js';
import { SupplierSearchRequestDto } from './dto/supplier-search-request.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { SupplierSearchOrderBy } from './enums/supplier-search-order-by.enum.js';
import { SupplierOption } from './interfaces/supplier-option.interface.js';

const OPTION_LIMIT = 20;

@Injectable()
export class SuppliersService {
  constructor(private readonly db: DatabaseService) {}

  async create(brandId: string, dto: CreateSupplierDto): Promise<Supplier> {
    const name = this.requiredText(dto.name);
    try {
      return await this.db.supplier.create({
        data: {
          brandId,
          name,
          normalizedName: this.normalizeName(name),
          legalName: this.optionalText(dto.legalName),
          taxId: this.optionalText(dto.taxId),
          phone: this.optionalText(dto.phone),
          email: this.optionalText(dto.email),
          contactPerson: this.optionalText(dto.contactPerson),
          notes: this.optionalText(dto.notes),
        },
      });
    } catch (error: any) {
      this.rethrowUnique(error);
      throw error;
    }
  }

  async update(
    brandId: string,
    supplierId: string,
    dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    await this.findByIdInBrand(brandId, supplierId);
    const name =
      dto.name !== undefined ? this.requiredText(dto.name) : undefined;
    try {
      return await this.db.supplier.update({
        where: { id: supplierId },
        data: {
          name,
          normalizedName: name ? this.normalizeName(name) : undefined,
          legalName:
            dto.legalName !== undefined
              ? this.optionalText(dto.legalName)
              : undefined,
          taxId:
            dto.taxId !== undefined ? this.optionalText(dto.taxId) : undefined,
          phone:
            dto.phone !== undefined ? this.optionalText(dto.phone) : undefined,
          email:
            dto.email !== undefined ? this.optionalText(dto.email) : undefined,
          contactPerson:
            dto.contactPerson !== undefined
              ? this.optionalText(dto.contactPerson)
              : undefined,
          notes:
            dto.notes !== undefined ? this.optionalText(dto.notes) : undefined,
          isActive: dto.isActive,
        },
      });
    } catch (error: any) {
      this.rethrowUnique(error);
      throw error;
    }
  }

  async deactivate(brandId: string, supplierId: string): Promise<void> {
    await this.findByIdInBrand(brandId, supplierId);
    await this.db.supplier.update({
      where: { id: supplierId },
      data: { isActive: false },
    });
  }

  async findByIdInBrand(
    brandId: string,
    supplierId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Supplier> {
    const supplier = await (tx ?? this.db).supplier.findFirst({
      where: { id: supplierId, brandId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async resolveActiveForDocument(
    brandId: string,
    supplierId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Supplier> {
    const supplier = await this.findByIdInBrand(brandId, supplierId, tx);
    if (!supplier.isActive) {
      throw new AppException(ErrorCode.SUPPLIER_INACTIVE, HttpStatus.CONFLICT);
    }
    return supplier;
  }

  async search(
    brandId: string,
    dto: SupplierSearchRequestDto,
  ): Promise<PaginatedResult<Supplier>> {
    const where = this.supplierWhere(brandId, dto);
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const args: Prisma.SupplierFindManyArgs = {
      where,
      orderBy: stableOrderBy(
        { [dto.orderBy ?? SupplierSearchOrderBy.UPDATED_AT]: direction },
        direction,
      ),
    };
    if (!dto.isExport) {
      args.skip = (dto.page - 1) * dto.pageSize;
      args.take = dto.pageSize;
    }
    const [items, totalItems] = await this.db.$transaction([
      this.db.supplier.findMany(args),
      this.db.supplier.count({ where }),
    ]);
    return { items, totalItems };
  }

  listOptions(
    brandId: string,
    dto: SupplierOptionsRequestDto,
  ): Promise<SupplierOption[]> {
    return this.db.supplier.findMany({
      where: this.supplierWhere(brandId, {
        ...dto,
        isActive: true,
      }),
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: OPTION_LIMIT,
    });
  }

  private supplierWhere(
    brandId: string,
    filter: { search?: string; isActive?: boolean },
  ): Prisma.SupplierWhereInput {
    const where: Prisma.SupplierWhereInput = {
      brandId,
      isActive: filter.isActive,
    };
    const search = filter.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { legalName: { contains: search, mode: 'insensitive' } },
        { taxId: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private rethrowUnique(error: any): void {
    if (error?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
      throw new AppException(
        ErrorCode.SUPPLIER_NAME_EXISTS,
        HttpStatus.CONFLICT,
      );
    }
  }

  private requiredText(value: string): string {
    const text = value.trim();
    if (!text) {
      throw new AppException(
        ErrorCode.SUPPLIER_NAME_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    return text;
  }

  private optionalText(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }
}
