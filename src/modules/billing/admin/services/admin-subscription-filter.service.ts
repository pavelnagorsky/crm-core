import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionPaymentStatus } from '@prisma/client';
import { AccessService } from '../../../access/services/access.service.js';
import { BrandService } from '../../../brand/services/brand.service.js';
import { UserService } from '../../../user/services/user.service.js';
import { AdminSubscriptionsRequestDto } from '../../dto/admin-subscriptions-request.dto.js';

/** Max brand ids taken from a name or owner email search (plan section 8.3). */
const SEARCH_LIMIT = 500;

/** Turns the admin list filters into the SQL part of the subscription search. */
@Injectable()
export class AdminSubscriptionFilter {
  constructor(
    private readonly brands: BrandService,
    private readonly users: UserService,
    private readonly accessService: AccessService,
  ) {}

  /** Null when the text search matches no brand. */
  async where(
    dto: AdminSubscriptionsRequestDto,
  ): Promise<Prisma.SubscriptionWhereInput | null> {
    const and: Prisma.SubscriptionWhereInput[] = [];
    if (dto.planCode?.length)
      and.push({ plan: { code: { in: dto.planCode } } });
    if (dto.countryCode?.length)
      and.push({ countryCode: { in: dto.countryCode } });
    if (dto.accessEndsBefore || dto.accessEndsAfter)
      and.push({
        accessEndsAt: {
          lt: dto.accessEndsBefore ? new Date(dto.accessEndsBefore) : undefined,
          gte: dto.accessEndsAfter ? new Date(dto.accessEndsAfter) : undefined,
        },
      });
    if (dto.hasPendingPayment !== undefined) {
      const pending = { status: SubscriptionPaymentStatus.PENDING };
      and.push({
        payments: dto.hasPendingPayment ? { some: pending } : { none: pending },
      });
    }
    if (dto.search) {
      const brandIds = await this.searchBrandIds(dto.search);
      if (!brandIds.length) return null;
      and.push({ brandId: { in: brandIds } });
    }
    return { AND: and };
  }

  /** Brands found by name or by an owner email. */
  private async searchBrandIds(search: string): Promise<string[]> {
    const [byName, userIds] = await Promise.all([
      this.brands.findIdsByName(search, SEARCH_LIMIT),
      this.users.findIdsByEmail(search, SEARCH_LIMIT),
    ]);
    const byOwner = await this.accessService.findBrandIdsOwnedBy(userIds);
    return [...new Set([...byName, ...byOwner])];
  }
}
