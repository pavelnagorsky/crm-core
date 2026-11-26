import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, SupportRequestStatus, User } from '@prisma/client';
import { IFrontendConfig } from '../../../config/interfaces/frontend-config.interface.js';
import { IMailerConfig } from '../../../config/interfaces/mailer-config.interface.js';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PrivateFilesService } from '../../files/services/private-files.service.js';
import { SupportRequestEmailData } from '../../notifications/interfaces/support-request-email-data.interface.js';
import { SupportRequestForwardedNotification } from '../../notifications/messages/support-request-forwarded.notification.js';
import { SupportRequestReceivedNotification } from '../../notifications/messages/support-request-received.notification.js';
import { NOTIFICATION_EVENT } from '../../notifications/services/notifications.service.js';
import { UserService } from '../../user/services/user.service.js';
import { CreateSupportRequestDto } from '../dto/create-support-request.dto.js';
import { SupportRequestSearchRequestDto } from '../dto/support-request-search-request.dto.js';
import { UpdateSupportRequestDto } from '../dto/update-support-request.dto.js';
import { SupportRequestOrderBy } from '../enums/support-request-order-by.enum.js';
import { SupportRequestDetails } from '../interfaces/support-request-details.interface.js';
import { SupportRequestWithAttachments } from '../interfaces/support-request-with-attachments.interface.js';

const ATTACHMENTS_INCLUDE = {
  attachments: {
    select: { privateFileId: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.SupportRequestInclude;

@Injectable()
export class SupportService {
  private readonly supportEmail: string;
  private readonly domain: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly privateFiles: PrivateFilesService,
    private readonly userService: UserService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.supportEmail = config.get<IMailerConfig>('emailConfig')!.supportEmail;
    this.domain = config.get<IFrontendConfig>('frontend')!.domain;
  }

  /**
   * `userId` is null for guests. Attachments are linked in the given order. Once stored, the author
   * gets a confirmation and support gets a copy; the emails never fail the request.
   */
  async create(
    dto: CreateSupportRequestDto,
    userId: string | null,
  ): Promise<SupportRequestWithAttachments> {
    const attachmentIds = dto.fileIds ?? [];
    if (!userId && attachmentIds.length) {
      throw new AppException(
        ErrorCode.SUPPORT_ATTACHMENTS_REQUIRE_AUTH,
        HttpStatus.BAD_REQUEST,
      );
    }
    const user = userId ? await this.userService.findById(userId) : null;
    const email = this.resolveReplyEmail(dto.email, user);
    const created = await this.db.$transaction(async (tx) => {
      const request = await tx.supportRequest.create({
        data: { userId, email, message: dto.message.trim() },
      });
      if (userId && attachmentIds.length) {
        await this.privateFiles.attach(attachmentIds, userId, tx);
        await tx.supportRequestAttachment.createMany({
          data: attachmentIds.map((privateFileId, position) => ({
            supportRequestId: request.id,
            privateFileId,
            position,
          })),
        });
      }
      return {
        ...request,
        attachments: attachmentIds.map((privateFileId) => ({ privateFileId })),
      };
    });
    this.notify(created, user);
    return created;
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

  /** Attachments come with signed links that expire; reload the request to refresh them. */
  async findDetails(id: string): Promise<SupportRequestDetails> {
    const request = await this.findById(id);
    const files = await this.privateFiles.signMany(
      request.attachments.map((attachment) => attachment.privateFileId),
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

  /** Attachments go with the request, from the database and from storage. */
  async delete(id: string): Promise<void> {
    const attachments = await this.db.supportRequestAttachment.findMany({
      where: { supportRequestId: id },
      select: { privateFileId: true },
    });
    try {
      await this.db.supportRequest.delete({ where: { id } });
    } catch (error) {
      this.rethrowNotFound(error);
    }
    await this.privateFiles.deleteMany(
      attachments.map((attachment) => attachment.privateFileId),
    );
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

  /** Queued through the notifications listener, which logs its own failures. */
  private notify(request: SupportRequestWithAttachments, user: User | null) {
    const data: SupportRequestEmailData = {
      requestId: request.id,
      email: request.email,
      userName: user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          this.accountEmail(user) ||
          user.phone
        : null,
      message: request.message,
      attachmentCount: request.attachments.length,
      adminLink: new URL(
        `/admin/support/${request.id}/`,
        this.domain,
      ).toString(),
    };
    this.events.emit(
      NOTIFICATION_EVENT,
      new SupportRequestReceivedNotification(data),
    );
    this.events.emit(
      NOTIFICATION_EVENT,
      new SupportRequestForwardedNotification(this.supportEmail, data),
    );
  }

  private accountEmail(user: User | null): string | null {
    return user?.email?.trim().toLowerCase() || null;
  }

  private resolveReplyEmail(
    email: string | null | undefined,
    user: User | null,
  ): string {
    const provided = email?.trim().toLowerCase();
    if (provided) return provided;
    const accountEmail = this.accountEmail(user);
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
