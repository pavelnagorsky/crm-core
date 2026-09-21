import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { MetricUnit } from '../../dashboard/enums/metric-unit.enum.js';
import { ServicesService } from '../../services/services.service.js';
import { StaffFilterDto } from '../dto/staff-filter.dto.js';
import { StaffKpiCardDto } from './dto/staff-kpi-card.dto.js';
import { StaffWidgetsRequestDto } from './dto/staff-widgets-request.dto.js';
import { StaffWidgetKey } from './enums/staff-widget-key.enum.js';
import { StaffWidgetContext } from './interfaces/staff-widget-context.interface.js';

const DEACTIVATION_WINDOW_DAYS = 30;

@Injectable()
export class StaffKpiService {
  constructor(
    private readonly db: DatabaseService,
    private readonly servicesService: ServicesService,
  ) {}

  async getWidgets(businessId: string, dto: StaffWidgetsRequestDto): Promise<StaffKpiCardDto[]> {
    const ctx = await this.buildContext(businessId, dto);
    return dto.keys.map((key) => this.buildCard(key, ctx));
  }

  private buildCard(key: StaffWidgetKey, ctx: StaffWidgetContext): StaffKpiCardDto {
    switch (key) {
      case StaffWidgetKey.ACTIVE_STAFF:
        return new StaffKpiCardDto({
          key,
          unit: MetricUnit.COUNT,
          value: ctx.activeCount,
          secondaryValue: ctx.deactivatedRecentlyCount,
        });
      case StaffWidgetKey.STAFF_UTILIZATION:
        return new StaffKpiCardDto({
          key,
          unit: MetricUnit.PERCENT,
          value: pct(ctx.staffWithShiftsCount, ctx.activeCount),
          numerator: ctx.staffWithShiftsCount,
          denominator: ctx.activeCount,
        });
      case StaffWidgetKey.SERVICE_COVERAGE:
        return new StaffKpiCardDto({
          key,
          unit: MetricUnit.PERCENT,
          value: pct(ctx.coveredServicesCount, ctx.activeServicesCount),
          numerator: ctx.coveredServicesCount,
          denominator: ctx.activeServicesCount,
        });
      case StaffWidgetKey.STAFF_WITHOUT_SHIFTS:
        return new StaffKpiCardDto({
          key,
          unit: MetricUnit.COUNT,
          value: ctx.activeCount - ctx.staffWithShiftsCount,
        });
      default: {
        const _exhaustive: never = key;
        throw new Error(`Unhandled staff widget key: ${_exhaustive}`);
      }
    }
  }

  private async buildContext(businessId: string, dto: StaffWidgetsRequestDto): Promise<StaffWidgetContext> {
    const where = this.buildWhere(businessId, dto);
    const week = currentWeekRange();

    const needsActive = dto.keys.some(
      (k) =>
        k === StaffWidgetKey.ACTIVE_STAFF ||
        k === StaffWidgetKey.STAFF_UTILIZATION ||
        k === StaffWidgetKey.STAFF_WITHOUT_SHIFTS,
    );
    const needsDeactivated = dto.keys.includes(StaffWidgetKey.ACTIVE_STAFF);
    const needsShifts =
      dto.keys.includes(StaffWidgetKey.STAFF_UTILIZATION) ||
      dto.keys.includes(StaffWidgetKey.STAFF_WITHOUT_SHIFTS);
    const needsCoverage = dto.keys.includes(StaffWidgetKey.SERVICE_COVERAGE);

    const [activeCount, deactivatedRecentlyCount, staffWithShiftsCount, coverage] = await Promise.all([
      needsActive ? this.db.staff.count({ where: { ...where, isActive: true } }) : Promise.resolve(0),
      needsDeactivated ? this.db.staff.count({ where: this.deactivatedSinceWhere(businessId, dto) }) : Promise.resolve(0),
      needsShifts ? this.countActiveStaffWithShiftsInWeek(businessId, dto, week) : Promise.resolve(0),
      needsCoverage ? this.computeServiceCoverage(businessId) : Promise.resolve({ covered: 0, total: 0 }),
    ]);

    return { activeCount, deactivatedRecentlyCount, staffWithShiftsCount, coveredServicesCount: coverage.covered, activeServicesCount: coverage.total };
  }

  /**
   * Shared filter surface for the staff listing and the KPI widgets, so a manager's active
   * filters narrow the cards and the table identically.
   */
  buildWhere(businessId: string, filter: StaffFilterDto): Prisma.StaffWhereInput {
    const where: Prisma.StaffWhereInput = { businessId };
    if (filter.search) where.name = { contains: filter.search, mode: 'insensitive' };
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    return where;
  }

  private deactivatedSinceWhere(businessId: string, filter: StaffFilterDto): Prisma.StaffWhereInput {
    const since = new Date();
    since.setDate(since.getDate() - DEACTIVATION_WINDOW_DAYS);
    const where = this.buildWhere(businessId, filter);
    // Override isActive: deactivations are inherently inactive, regardless of the list filter.
    where.isActive = false;
    where.deactivatedAt = { gte: since };
    return where;
  }

  private countActiveStaffWithShiftsInWeek(
    businessId: string,
    filter: StaffFilterDto,
    week: { from: Date; to: Date },
  ): Promise<number> {
    return this.db.staff.count({
      where: {
        ...this.buildWhere(businessId, filter),
        isActive: true,
        shifts: { some: { date: { gte: week.from, lte: week.to } } },
      },
    });
  }

  private async computeServiceCoverage(businessId: string): Promise<{ covered: number; total: number }> {
    // The `service` table belongs to the services domain; get the active service ids through
    // its owning service rather than querying it here. Coverage denominator is all active
    // services (staff-name filters narrow staff, not the service catalogue).
    const activeServiceIds = await this.servicesService.findIdsByFilter(businessId, { isActive: true });
    if (activeServiceIds.length === 0) return { covered: 0, total: 0 };

    // `staffService` is owned by this domain; find the distinct active-service ids that have at
    // least one active staff member assigned. Rooting the query on `staffService` keeps us inside
    // this domain's tables rather than querying the `service` table directly.
    const coveredRows = await this.db.staffService.findMany({
      where: {
        serviceId: { in: activeServiceIds },
        staff: { businessId, isActive: true },
      },
      distinct: ['serviceId'],
      select: { serviceId: true },
    });
    return { covered: coveredRows.length, total: activeServiceIds.length };
  }
}

function pct(part: number, total: number): number {
  return total > 0 ? +((part / total) * 100).toFixed(1) : 0;
}

/**
 * Current week as an inclusive Monday..Sunday date window, matched against `staffShift.date`
 * (a plain @db.Date). Boundaries are UTC-midnight `Date`s so they compare cleanly against the
 * date-only column. UTC (not business timezone) is deliberate: shifts are stored and queried
 * timezone-naive throughout (see StaffService.getShifts/replaceShifts), so a UTC week keeps
 * this consistent.
 */
function currentWeekRange(): { from: Date; to: Date } {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 6));
  return { from, to };
}
