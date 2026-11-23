import { Injectable } from '@nestjs/common';
import {
  AnyStaffRule,
  BookingExecutionMode,
} from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { StaffingPreview } from '../interfaces/staffing-preview.interface.js';
import { StaffingPreviewRequest } from '../interfaces/staffing-preview-request.interface.js';
import { rankStaff } from '../rules/staff-ranking.rules.js';
import { BookingStaffLoadService } from './booking-staff-load.service.js';

/**
 * Staffing of a visit at a given local start, for the cabinet price check. It reads what
 * booking creation reads (qualified staff, calendar availability, day load) and ranks the
 * free staff with the same rule (rankStaff), so the staff member shown is the one a booking
 * made at that time would get. A bundle needs one staff member for all its items; the visit
 * lasts the sum of the items (sequential) or the longest one (parallel).
 */
@Injectable()
export class BookingStaffingPreviewService {
  constructor(
    private readonly staff: StaffService,
    private readonly calendar: CalendarFacade,
    private readonly locations: LocationService,
    private readonly catalog: ServiceCatalogFacade,
    private readonly staffLoad: BookingStaffLoadService,
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
    const startAt = TimeUtils.localToUtc(`${date}T${time}:00`, location.timezone);
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
        (await this.rankFirst(
          locationId,
          request,
          freeStaffIds,
          location.anyStaffRule,
          location.timezone,
        )),
    };
  }

  private async rankFirst(
    locationId: string,
    request: StaffingPreviewRequest,
    freeStaffIds: readonly string[],
    rule: AnyStaffRule,
    timezone: string,
  ): Promise<string | null> {
    if (freeStaffIds.length === 0) return null;
    const [loads, lastAssigned] = await Promise.all([
      this.staffLoad.dayLoads(
        locationId,
        freeStaffIds,
        request.date,
        request.date,
        timezone,
      ),
      rule === AnyStaffRule.ROUND_ROBIN
        ? this.staffLoad.lastAssignedAt(locationId, freeStaffIds)
        : new Map<string, number>(),
    ]);
    const ranked = rankStaff(
      freeStaffIds.map((id) => ({
        id,
        busy: false,
        price: request.serviceIds.reduce(
          (sum, serviceId) =>
            sum + request.book.candidatePrice(serviceId, id, request.bundleId),
          0,
        ),
        dayLoad: loads.get(id)?.get(request.date) ?? 0,
        lastAssignedAt: lastAssigned.get(id) ?? null,
      })),
      rule,
    );
    return ranked[0] ?? null;
  }

  /** Minutes the visit takes, buffers included. */
  private async visitShape(
    locationId: string,
    serviceIds: readonly string[],
    bundleId: string | null,
  ): Promise<{ minutes: number }> {
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
      minutes: parallel
        ? Math.max(...lengths)
        : lengths.reduce((sum, length) => sum + length, 0),
    };
  }
}
