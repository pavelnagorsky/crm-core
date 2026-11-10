import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, SupportRequestStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { FilesService } from '../../files/services/files.service.js';
import { UserService } from '../../user/services/user.service.js';
import { CreateSupportRequestDto } from '../dto/create-support-request.dto.js';
import { SupportRequestSearchRequestDto } from '../dto/support-request-search-request.dto.js';
import { UpdateSupportRequestDto } from '../dto/update-support-request.dto.js';
import { SupportRequestOrderBy } from '../enums/support-request-order-by.enum.js';
import { SupportRequestDetails } from '../interfaces/support-request-details.interface.js';
import { SupportRequestWithAttachments } from '../interfaces/support-request-with-attachments.interface.js';

const ATTACHMENTS_INCLUDE = {
  attachments: {
    select: { fileId: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.SupportRequestInclude;

@Injectable()
export class SupportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly filesService: FilesService,
    private readonly userService: UserService,
  ) {}

  /** `userId` is null for guests. */
  async create(
    dto: CreateSupportRequestDto,
    userId: string | null,
  ): Promise<SupportRequestWithAttachments> {
    const fileIds = dto.fileIds ?? [];
    if (!userId && fileIds.length) {
      throw new AppException(
        ErrorCode.SUPPORT_ATTACHMENTS_REQUIRE_AUTH,
        HttpStatus.BAD_REQUEST,
      );
    }
    const email = await this.resolveReplyEmail(dto.email, userId);
    const files = userId
      ? await this.filesService.findManyInUser(userId, fileIds)
      : [];
    try {
      return await this.db.supportRequest.create({
        data: {
          userId,
          email,
          message: dto.message.trim(),
          attachments: {
            create: files.map((file, position) => ({
              fileId: file.id,
              position,
            })),
          },
        },
        include: ATTACHMENTS_INCLUDE,
      });
    } catch (error) {
      // A file may be deleted between the ownership check and the insert.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION
      ) {
        throw new AppException(ErrorCode.FILE_NOT_FOUND, HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async search(
    dto: SupportRequestSearchRequestDto,
  ): Promise<PaginatedResult<SupportRequestWithAttachments>> {
    const search = dto.search?.trim();
    const where: Prisma.SupportRequestWhereInput = { status: dto.status };
    if (search) {
      const contains: Prisma.StringFilter = {
        contains: search,
        mode: Prisma.QueryMode.insensitive,
      };
      where.OR = [
        { email: contains },
        { message: contains },
        { notes: contains },
      ];
    }
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const args = {
      where,
      include: ATTACHMENTS_INCLUDE,
      orderBy: stableOrderBy(
        { [dto.orderBy ?? SupportRequestOrderBy.CREATED_AT]: direction },
        direction,
      ),
      ...(dto.isExport
        ? {}
        : { skip: (dto.page - 1) * dto.pageSize, take: dto.pageSize }),
    } satisfies Prisma.SupportRequestFindManyArgs;
    const [items, totalItems] = await this.db.$transaction([
      this.db.supportRequest.findMany(args),
      this.db.supportRequest.count({ where }),
    ]);
    return { items, totalItems };
  }

  async findDetails(id: string): Promise<SupportRequestDetails> {
    const request = await this.findById(id);
    const files = await this.filesService.findManyByIds(
      request.attachments.map((attachment) => attachment.fileId),
    );
    return { request, files };
  }

  async update(
    id: string,
    dto: UpdateSupportRequestDto,
  ): Promise<SupportRequestWithAttachments> {
    if (dto.status === undefined && dto.notes === undefined) {
      throw new AppException(
        ErrorCode.SUPPORT_REQUEST_UPDATE_EMPTY,
        HttpStatus.BAD_REQUEST,
      );
    }
    const current = await this.findById(id);
    try {
      return await this.db.supportRequest.update({
        where: { id },
        data: {
          status: dto.status,
          resolvedAt:
            dto.status === undefined
              ? undefined
              : this.resolvedAt(dto.status, current.resolvedAt),
          notes:
            dto.notes === undefined ? undefined : dto.notes?.trim() || null,
        },
        include: ATTACHMENTS_INCLUDE,
      });
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.supportRequest.delete({ where: { id } });
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  private async findById(id: string): Promise<SupportRequestWithAttachments> {
    const request = await this.db.supportRequest.findUnique({
      where: { id },
      include: ATTACHMENTS_INCLUDE,
    });
    if (!request) throw this.notFound();
    return request;
  }

  /** Keeps the first resolution time across repeated RESOLVED updates; reopening clears it. */
  private resolvedAt(
    status: SupportRequestStatus,
    current: Date | null,
  ): Date | null {
    if (status !== SupportRequestStatus.RESOLVED) return null;
    return current ?? new Date();
  }

  private async resolveReplyEmail(
    email: string | null | undefined,
    userId: string | null,
  ): Promise<string> {
    const provided = email?.trim().toLowerCase();
    if (provided) return provided;
    const accountEmail = userId
      ? (await this.userService.findById(userId)).email?.trim().toLowerCase()
      : null;
    if (!accountEmail) {
      throw new AppException(
        ErrorCode.SUPPORT_EMAIL_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    return accountEmail;
  }

  private notFound(): AppException {
    return new AppException(
      ErrorCode.SUPPORT_REQUEST_NOT_FOUND,
      HttpStatus.NOT_FOUND,
    );
  }

  private rethrowNotFound(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PrismaErrorCode.RECORD_NOT_FOUND
    ) {
      throw this.notFound();
    }
    throw error;
  }
}
