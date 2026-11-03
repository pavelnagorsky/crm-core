import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Feedback, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { CreateFeedbackDto } from '../dto/create-feedback.dto.js';
import { FeedbackSearchRequestDto } from '../dto/feedback-search-request.dto.js';
import { UpdateFeedbackDto } from '../dto/update-feedback.dto.js';
import { FeedbackOrderBy } from '../enums/feedback-order-by.enum.js';

@Injectable()
export class FeedbackService {
  constructor(private readonly db: DatabaseService) {}

  create(dto: CreateFeedbackDto): Promise<Feedback> {
    const phone = this.optionalText(dto.phone);
    const email = this.optionalText(dto.email)?.toLowerCase() ?? null;
    if (!phone && !email)
      throw new BadRequestException('Phone or email is required');
    return this.db.feedback.create({
      data: {
        name: dto.name.trim(),
        company: this.optionalText(dto.company),
        phone,
        email,
        message: this.optionalText(dto.message),
      },
    });
  }

  async search(
    dto: FeedbackSearchRequestDto,
  ): Promise<PaginatedResult<Feedback>> {
    const search = dto.search?.trim();
    const where: Prisma.FeedbackWhereInput = { status: dto.status };
    if (search) {
      const contains: Prisma.StringFilter = {
        contains: search,
        mode: Prisma.QueryMode.insensitive,
      };
      where.OR = [
        { name: contains },
        { company: contains },
        { phone: contains },
        { email: contains },
        { message: contains },
        { notes: contains },
      ];
    }
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const args: Prisma.FeedbackFindManyArgs = {
      where,
      orderBy: stableOrderBy(
        { [dto.orderBy ?? FeedbackOrderBy.CREATED_AT]: direction },
        direction,
      ),
    };
    if (!dto.isExport) {
      args.skip = (dto.page - 1) * dto.pageSize;
      args.take = dto.pageSize;
    }
    const [items, totalItems] = await this.db.$transaction([
      this.db.feedback.findMany(args),
      this.db.feedback.count({ where }),
    ]);
    return { items, totalItems };
  }

  async findById(id: string): Promise<Feedback> {
    const feedback = await this.db.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('Feedback not found');
    return feedback;
  }

  async update(id: string, dto: UpdateFeedbackDto): Promise<Feedback> {
    if (dto.status === undefined && dto.notes === undefined) {
      throw new BadRequestException('Status or notes is required');
    }
    try {
      return await this.db.feedback.update({
        where: { id },
        data: {
          status: dto.status,
          notes:
            dto.notes === undefined ? undefined : this.optionalText(dto.notes),
        },
      });
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.feedback.delete({ where: { id } });
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  private optionalText(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private rethrowNotFound(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PrismaErrorCode.RECORD_NOT_FOUND
    ) {
      throw new NotFoundException('Feedback not found');
    }
    throw error;
  }
}
