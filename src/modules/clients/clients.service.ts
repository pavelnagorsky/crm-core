import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Client, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { ClientSearchRequestDto } from './dto/client-search-request.dto.js';
import { ClientSearchOrderBy } from './enums/client-search-order-by.enum.js';

@Injectable()
export class ClientsService {
  constructor(private readonly db: DatabaseService) {}

  async create(businessId: string, dto: CreateClientDto): Promise<Client> {
    try {
      return await this.db.client.create({ data: { businessId, ...this.buildClientFields(dto) } });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        throw new AppException(ErrorCode.CLIENT_PHONE_EXISTS, HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  async update(clientId: string, dto: UpdateClientDto): Promise<Client> {
    await this.findById(clientId);
    try {
      return await this.db.client.update({ where: { id: clientId }, data: this.buildClientFields(dto) });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        throw new AppException(ErrorCode.CLIENT_PHONE_EXISTS, HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  async delete(clientId: string): Promise<void> {
    await this.findById(clientId);
    await this.db.client.delete({ where: { id: clientId } });
  }

  async findById(clientId: string): Promise<Client> {
    const client = await this.db.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  resolveForBooking(
    businessId: string,
    phone: string,
    firstName: string,
    lastName: string,
    email?: string,
  ): Promise<Client> {
    return this.db.client.upsert({
      where: { businessId_phone: { businessId, phone } },
      update: {},
      create: { businessId, firstName, lastName, phone, email: email ?? null },
    });
  }

  async search(businessId: string, dto: ClientSearchRequestDto): Promise<PaginatedResult<Client>> {
    const where: Prisma.ClientWhereInput = { businessId };

    if (dto.search) {
      where.OR = [
        { firstName: { contains: dto.search, mode: 'insensitive' } },
        { lastName: { contains: dto.search, mode: 'insensitive' } },
        { phone: { contains: dto.search } },
        { email: { contains: dto.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.ClientOrderByWithRelationInput = {
      [dto.orderBy ?? ClientSearchOrderBy.CREATED_AT]: dto.orderDirection ?? OrderDirection.DESC,
    };

    const findArgs: Prisma.ClientFindManyArgs = { where, orderBy };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.client.findMany(findArgs),
      this.db.client.count({ where }),
    ]);

    return { items, totalItems };
  }

  private buildClientFields(dto: CreateClientDto | UpdateClientDto) {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      email: dto.email ?? null,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      gender: dto.gender ?? null,
      notes: dto.notes ?? null,
    };
  }
}
