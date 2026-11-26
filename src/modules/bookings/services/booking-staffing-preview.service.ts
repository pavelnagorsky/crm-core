import { Injectable } from '@nestjs/common';
import { BookingExecutionMode } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { StaffingPreview } from '../interfaces/staffing-preview.interface.js';
import { StaffingPreviewRequest } from '../interfaces/staffing-preview-request.interface.js';
import { BookingServiceSnapshot } from '../interfaces/booking-service-snapshot.interface.js';
import { BookingSchedulingService } from './booking-scheduling.service.js';

/**
 * Staffing of a visit at a given local start, for the cabinet price check. The staff member
 * is ranked by BookingSchedulingService.assignTeam, the function booking creation uses. A
 * bundle needs one staff member for all its items (oneStaffForAll); the visit lasts the sum
 * of the items (sequential) or the longest one (parallel).
 */
@Injectable()
export class BookingStaffingPreviewService {
  constructor(
    private readonly staff: StaffService,
    private readonly calendar: CalendarFacade,
    private readonly locations: LocationService,
    private readonly catalog: ServiceCatalogFacade,
    private readonly scheduling: BookingSchedulingService,
  ) {}

  async preview(
    locationId: string,
    request: StaffingPreviewRequest,
  ): Promise<StaffingPreview> {
    const { serviceIds, bundleId, date, time } = request;
    const [location, visit] = await Promise.all([
      this.locations.getBookingSettings(locationId),
      this.visitShape(locationId, serviceIds, bundleId),
    ]);
    const qualified =
      serviceIds.length === 1
        ? await this.staff.resolveStaffForService(locationId, serviceIds[0])
        : (await this.staff.resolveStaffingForServices(locationId, serviceIds))
            .coverableBySingle;
    const startAt = TimeUtils.localToUtc(
      `${date}T${time}:00`,
      location.timezone,
    );
    const endAt = new Date(startAt.getTime() + visit.minutes * 60_000);
    const free = await this.calendar.filterAvailableStaff(
      locationId,
      qualified,
      date,
      startAt,
      endAt,
      location.timezone,
    );
    const freeStaffIds = free.map((member) => member.id);
    return {
      qualifiedStaffIds: qualified.map((member) => member.id),
      freeStaffIds,
      assignedStaffId:
        request.staffId ??
        (freeStaffIds.length === 0
          ? null
          : ((
              await this.scheduling.assignTeam({
                locationId,
                bundleId,
                services: visit.services,
                prices: ReadConsistency.CACHED,
                book: request.book,
                startAt,
                executionMode: visit.executionMode,
                timezone: location.timezone,
                manualItems: [],
                customEndAt: null,
                staffRule: location.anyStaffRule,
                pricingContext: request.context ?? null,
                oneStaffForAll: true,
              })
            )?.[0] ?? null)),
    };
  }

  /** Minutes the visit takes, buffers included. */
  private async visitShape(
    locationId: string,
    serviceIds: readonly string[],
    bundleId: string | null,
  ): Promise<{
    minutes: number;
    services: BookingServiceSnapshot[];
    executionMode: BookingExecutionMode;
  }> {
    const services = await this.catalog.resolveServicesForAvailability(
      locationId,
      [...serviceIds],
    );
    const lengths = services.map(
      (service) => service.durationMinutes + service.bufferMinutes,
    );
    const parallel =
      bundleId !== null &&
      (await this.catalog.resolveBundleForAvailability(locationId, bundleId))
        .executionMode === BookingExecutionMode.PARALLEL;
    return {
      services,
      executionMode: parallel
        ? BookingExecutionMode.PARALLEL
        : BookingExecutionMode.SEQUENTIAL,
      minutes: parallel
        ? Math.max(...lengths)
        : lengths.reduce((sum, length) => sum + length, 0),
    };
  }
}
