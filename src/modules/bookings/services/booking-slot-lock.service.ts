import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { BookingSlot } from '../interfaces/booking-slot.interface.js';

@Injectable()
export class BookingSlotLockService {
  private readonly logger = new Logger(BookingSlotLockService.name);

  constructor(
    private readonly staffService: StaffService,
    private readonly calendar: CalendarFacade,
  ) {}

  async lockSlots(
    items: BookingSlot[],
    timezone: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const key of this.lockKeysForItems(items, timezone)) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
    }
  }

  async assertSlotsAvailable(
    locationId: string,
    items: BookingSlot[],
    timezone: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const excludedEventIds = items.flatMap((item) =>
      item.calendarEventId ? [item.calendarEventId] : [],
    );
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (
        items
          .slice(index + 1)
          .some(
            (other) =>
              other.staffId === item.staffId &&
              item.startAt < other.endAt &&
              other.startAt < item.endAt,
          )
      ) {
        throw new AppException(
          ErrorCode.BOOKING_SLOT_UNAVAILABLE,
          HttpStatus.CONFLICT,
        );
      }
    }
    for (const item of items) {
      const date = TimeUtils.zonedDateStr(item.startAt, timezone);
      const [shift, events] = await Promise.all([
        this.staffService.findShiftForDate(item.staffId, new Date(date), tx),
        this.calendar.listBlockingEvents(
          locationId,
          [item.staffId],
          item.startAt,
          item.endAt,
          excludedEventIds,
          tx,
        ),
      ]);
      // Re-check transaction-fetched data while holding the staff/day locks, so concurrent bookings cannot claim the same slot.
      if (
        !this.calendar.isSlotFree(
          item.staffId,
          date,
          item.startAt,
          item.endAt,
          shift,
          events,
          timezone,
        )
      ) {
        this.logger.warn(
          `slot unavailable: locationId=${locationId} staffId=${item.staffId} startAt=${item.startAt.toISOString()}`,
        );
        throw new AppException(
          ErrorCode.BOOKING_SLOT_UNAVAILABLE,
          HttpStatus.CONFLICT,
        );
      }
    }
  }

  private lockKeysForItems(items: BookingSlot[], timezone: string): bigint[] {
    return [
      ...new Set(
        items.map(
          (item) =>
            `${item.staffId}:${TimeUtils.zonedDateStr(item.startAt, timezone)}`,
        ),
      ),
    ]
      .map((key) => {
        const [staffId, dateStr] = key.split(':');
        return this.buildLockKey(staffId, dateStr);
      })
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  private buildLockKey(staffId: string, dateStr: string): bigint {
    const hash = createHash('sha256').update(`${staffId}:${dateStr}`).digest();
    return hash.readBigInt64BE(0);
  }
}
