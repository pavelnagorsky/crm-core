import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingVisibility } from '@prisma/client';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { BookingCacheWarmupEvent } from '../../../shared/events/booking-cache-warmup.event.js';
import { BrandService } from '../../brand/services/brand.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { ProductsService } from '../../products/services/products.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';

@Injectable()
export class BookingCacheWarmupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BookingCacheWarmupService.name);
  private readonly pending = new Set<string>();
  private activeRun: Promise<void> | undefined;
  private scheduledDrain: NodeJS.Immediate | undefined;
  private stopped = false;

  constructor(
    private readonly cache: AppCacheService,
    private readonly locations: LocationService,
    private readonly brands: BrandService,
    private readonly catalog: ServiceCatalogFacade,
    private readonly staff: StaffService,
    private readonly products: ProductsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled()) return;
    await this.sweep(true);
    this.logger.log('Public booking cache warmup complete');
  }

  @Cron(CronExpression.EVERY_HOUR, { waitForCompletion: true })
  async refreshPublicLocations(): Promise<void> {
    if (!this.enabled()) return;
    try {
      await this.sweep(false);
    } catch (error: unknown) {
      this.logger.error(
        'Public booking cache sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(BookingCacheWarmupEvent.eventName)
  request(event: BookingCacheWarmupEvent): void {
    if (!this.enabled()) return;
    this.pending.add(event.locationId);
    this.schedulePending();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.scheduledDrain) clearImmediate(this.scheduledDrain);
    this.pending.clear();
  }

  private enabled(): boolean {
    return !this.stopped && this.cache.enabled;
  }

  private async sweep(strict: boolean): Promise<void> {
    await this.runExclusive(async () => {
      let afterId: string | undefined;
      while (!this.stopped) {
        const targets = await this.locations.listPublicBookingTargets(afterId);
        if (!targets.length) break;
        await this.warmBatch(
          targets.map((target) => target.id),
          strict,
        );
        afterId = targets[targets.length - 1].id;
      }
    }, strict);
  }

  private async drainPending(): Promise<void> {
    if (!this.enabled()) return;
    await this.runExclusive(async () => {
      const batch = [...this.pending];
      this.pending.clear();
      await this.warmBatch(batch, false);
    }, false);
  }

  private async runExclusive(
    work: () => Promise<void>,
    wait: boolean,
  ): Promise<void> {
    while (this.activeRun) {
      if (!wait) return;
      await this.activeRun;
    }
    if (this.stopped) return;
    const task = Promise.resolve().then(work);
    this.activeRun = task;
    try {
      await task;
    } finally {
      if (this.activeRun === task) this.activeRun = undefined;
      if (this.pending.size) this.schedulePending();
    }
  }

  private schedulePending(): void {
    if (this.stopped || this.scheduledDrain) return;
    this.scheduledDrain = setImmediate(() => {
      this.scheduledDrain = undefined;
      void this.drainPending().catch((error: unknown) => {
        this.logger.error(
          'Public booking cache queue failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    });
  }

  private async warmBatch(ids: string[], strict: boolean): Promise<void> {
    let next = 0;
    const concurrency = Math.min(ids.length, 2);
    const workers = Array.from({ length: concurrency }, async () => {
      while (next < ids.length && !this.stopped) {
        const id = ids[next++];
        try {
          await this.warmLocation(id);
        } catch (error: unknown) {
          if (error instanceof NotFoundException) continue;
          if (strict) throw error;
          this.logger.warn(
            `Public booking cache warmup failed: locationId=${id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    });
    const results = await Promise.allSettled(workers);
    for (const result of results)
      if (result.status === 'rejected') throw result.reason;
  }

  private async warmLocation(locationId: string): Promise<void> {
    await this.locations.warmBookingSettings(locationId);
    const location = await this.locations.getBookingSettings(locationId);
    if (location.bookingVisibility !== BookingVisibility.PUBLIC) return;
    await this.brands.warmPublicProfile(location.brandId);
    await this.catalog.warmForBooking(locationId);
    await this.staff.warmBookingDirectory(locationId);
    await this.products.warmPublicCatalog(locationId);
    await this.staff.warmBookingSchedule(locationId);
  }
}
