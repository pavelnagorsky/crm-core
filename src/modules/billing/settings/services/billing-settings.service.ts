import { Injectable } from '@nestjs/common';
import { BillingSettings, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppCacheService } from '../../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../../shared/cache/cache-dependency.js';
import { BILLING_SETTINGS_CACHE } from '../../cache/billing-settings.cache.js';
import { UpdateBillingSettingsDto } from '../../dto/update-billing-settings.dto.js';
import { PaymentProviderRegistry } from '../../payments/payment-provider.registry.js';

const SETTINGS_ID = 1;

/** Owns BillingSettings: a single row created by the migration. */
@Injectable()
export class BillingSettingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cache: AppCacheService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  get(): Promise<BillingSettings> {
    return this.cache.getOrLoad(BILLING_SETTINGS_CACHE, {}, () => this.read());
  }

  /** Uncached; inside a transaction when a decision must see the committed row. */
  read(tx: Prisma.TransactionClient = this.db): Promise<BillingSettings> {
    return tx.billingSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
  }

  async update(
    dto: UpdateBillingSettingsDto,
    actorId: string,
  ): Promise<BillingSettings> {
    this.providers.getOwnerInitiated(dto.paymentProvider);
    const settings = await this.db.billingSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        defaultCountryCode: dto.defaultCountryCode.toUpperCase(),
        trialDays: dto.trialDays,
        graceDays: dto.graceDays,
        reminderDaysBefore: [...new Set(dto.reminderDaysBefore)].sort(
          (a, b) => b - a,
        ),
        paymentProvider: dto.paymentProvider,
        paymentRequestTtlDays: dto.paymentRequestTtlDays,
        pendingRequestGraceDays: dto.pendingRequestGraceDays,
        offlinePaymentInstructions: dto.offlinePaymentInstructions || null,
        adminNotifyEmail: dto.adminNotifyEmail?.toLowerCase() || null,
        enforcementEnabled: dto.enforcementEnabled,
        updatedById: actorId,
      },
    });
    await this.cache.invalidate(CacheDependency.billingSettings());
    return settings;
  }
}
