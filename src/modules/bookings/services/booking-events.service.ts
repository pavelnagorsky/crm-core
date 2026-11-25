import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { BOOKING_AUDIT_FIELDS } from '../../audit/fields/booking.fields.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditFieldChange } from '../../audit/interfaces/audit-field-change.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../../audit/utils/diff-fields.js';
import { LocationService } from '../../location/services/location.service.js';
import { BookingNotificationData } from '../../notifications/interfaces/booking-notification-data.interface.js';
import { BookingPriceChange } from '../../notifications/interfaces/booking-price-change.interface.js';
import { BookingConfirmedNotification } from '../../notifications/messages/booking-confirmed.notification.js';
import { BookingPendingNotification } from '../../notifications/messages/booking-pending.notification.js';
import {
  BookingStatusChangedNotification,
  BookingStatusChangedStatus,
} from '../../notifications/messages/booking-status-changed.notification.js';
import { NOTIFICATION_EVENT } from '../../notifications/services/notifications.service.js';
import { StaffBookingEvent } from '../../notifications/enums/staff-booking-event.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingAuditInput } from '../interfaces/booking-audit-input.interface.js';
import { BookingStatusNoticeDetails } from '../interfaces/booking-status-notice-details.interface.js';
import { servicesTotal } from '../rules/booking-services-total.rules.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingClientTokenService } from './booking-client-token.service.js';
import { BookingStaffNotificationService } from './booking-staff-notification.service.js';

@Injectable()
export class BookingEventsService {
  private readonly logger = new Logger(BookingEventsService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly bookingClientService: BookingClientTokenService,
    private readonly locationService: LocationService,
    private readonly staffNotifications: BookingStaffNotificationService,
  ) {}

  created(
    booking: BookingWithItems,
    actor: AuditActor,
    currency: string,
    bundleTitle: string | null,
  ): void {
    const event: AuditLogEvent = {
      locationId: booking.locationId,
      entityType: AuditEntity.BOOKING,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: {
        items: booking.items.map((item) => ({
          serviceName: item.serviceTitle,
          staffName: item.staffName,
          price: MoneyUtils.format(item.customPrice ?? item.chargedPrice),
        })),
        startTime: booking.startAt.toISOString(),
        endTime: booking.endAt.toISOString(),
        totalPrice: MoneyUtils.format(
          booking.items.reduce(
            (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
            new Prisma.Decimal(0),
          ),
        ),
        currency,
        channel: booking.channel,
        status: booking.status,
        isCustomTime: booking.isCustomTime,
        executionMode: booking.executionMode,
        ...(bundleTitle ? { bundleTitle } : {}),
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  notifyCreated(booking: BookingWithItems, timezone: string): void {
    const notification = this.createdNotification(booking, timezone);
    if (notification) this.eventEmitter.emit(NOTIFICATION_EVENT, notification);
  }

  /** The client's email about a new booking; null when there is no one to tell. */
  createdNotification(
    booking: BookingWithItems,
    timezone: string,
  ): BookingPendingNotification | BookingConfirmedNotification | null {
    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.CONFIRMED
    )
      return null;
    if (!booking.clientEmail) return null;
    const clientToken = this.bookingClientService.generateClientToken(
      booking.id,
    );
    const Notification =
      booking.status === BookingStatus.PENDING
        ? BookingPendingNotification
        : BookingConfirmedNotification;
    return new Notification(
      {
        ...this.notificationData(booking),
        clientEmail: booking.clientEmail,
        timezone,
      },
      this.bookingClientService.managementUrl(clientToken),
    );
  }

  /**
   * Tells the location's managers and the booking's staff what the client did. Runs in the
   * background: resolving recipients must not hold up the client, and it never throws.
   */
  notifyStaff(
    booking: BookingWithItems,
    event: StaffBookingEvent,
    previousStartAt: Date | null = null,
  ): void {
    void this.staffNotifications.notify(booking, event, previousStartAt);
  }

  audit(params: BookingAuditInput): void {
    const event: AuditLogEvent = {
      locationId: params.locationId,
      entityType: AuditEntity.BOOKING,
      entityId: params.entityId,
      eventType: params.eventType,
      actionType: params.actionType,
      occurredAt: new Date(),
      actor: params.actor,
      payload: params.payload,
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  private notificationData(
    booking: BookingWithItems,
  ): Omit<BookingNotificationData, 'clientEmail' | 'timezone'> {
    return {
      id: booking.id,
      locationId: booking.locationId,
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      serviceTitle: booking.items.map((item) => item.serviceTitle).join(', '),
      staffName: [...new Set(booking.items.map((item) => item.staffName))].join(
        ', ',
      ),
      startAt: booking.startAt,
      endAt: booking.endAt,
    };
  }

  async updated(
    old: BookingWithItems,
    updated: BookingWithItems,
    actor: AuditActor,
  ): Promise<void> {
    const changes = [
      ...diffFields(old, updated, BOOKING_AUDIT_FIELDS),
      ...this.itemValueChanges(
        old,
        updated,
        'staffName',
        (item) => item.staffName,
      ),
      ...this.itemValueChanges(old, updated, 'customPrice', (item) =>
        item.customPrice == null ? null : MoneyUtils.format(item.customPrice),
      ),
    ];
    if (changes.length === 0) return;
    const currency = changes.some((change) => change.field === 'customPrice')
      ? (await this.locationService.getLocale(old.locationId)).currency
      : undefined;
    this.logger.log(
      `booking updated: id=${old.id} locationId=${old.locationId} fields=${changes.map((change) => change.field).join(',')}`,
    );
    this.audit({
      locationId: old.locationId,
      entityId: old.id,
      eventType: AuditEvent.BOOKING_UPDATED,
      actionType: AuditActionType.MODIFY,
      actor,
      payload: { changes, ...(currency ? { currency } : {}) },
    });
  }

  async notifyStatus(
    booking: BookingWithItems,
    status: BookingStatusChangedStatus,
    details: BookingStatusNoticeDetails = {},
  ): Promise<void> {
    if (!booking.clientEmail) return;
    const locale = await this.locationService.getLocale(booking.locationId);
    const notification = this.statusNotification(
      booking,
      status,
      details,
      locale,
    );
    if (notification) this.eventEmitter.emit(NOTIFICATION_EVENT, notification);
  }

  /** The client's email about a status change; null when the booking has no email. */
  statusNotification(
    booking: BookingWithItems,
    status: BookingStatusChangedStatus,
    details: BookingStatusNoticeDetails,
    locale: { timezone: string; currency: string },
  ): BookingStatusChangedNotification | null {
    if (!booking.clientEmail) return null;
    return new BookingStatusChangedNotification(
      {
        ...this.notificationData(booking),
        clientEmail: booking.clientEmail,
        timezone: locale.timezone,
      },
      status,
      {
        cancellationReason: details.cancellationReason,
        previousStartAt: details.previousStartAt,
        priceChange: this.priceChange(
          booking,
          details.previousServicesTotal ?? null,
          locale.currency,
        ),
        // A cancelled booking has nothing left to manage.
        manageLink:
          status === 'CANCELLED'
            ? null
            : this.bookingClientService.managementUrl(
                this.bookingClientService.generateClientToken(booking.id),
              ),
      },
    );
  }

  /** The new price of a move, when it differs from the total before it. */
  private priceChange(
    booking: BookingWithItems,
    previous: Prisma.Decimal | null,
    currency: string,
  ): BookingPriceChange | null {
    if (previous === null) return null;
    const total = servicesTotal(booking.items);
    if (total.equals(previous)) return null;
    const money = (amount: Prisma.Decimal) =>
      `${MoneyUtils.format(amount)} ${currency}`;
    return { price: money(total), previousPrice: money(previous) };
  }

  private itemValueChanges(
    old: BookingWithItems,
    updated: BookingWithItems,
    field: string,
    read: (item: BookingWithItems['items'][number]) => string | null,
  ): AuditFieldChange[] {
    const nextById = new Map(updated.items.map((item) => [item.id, item]));
    const multiple = old.items.length > 1;
    const changes: AuditFieldChange[] = [];
    for (const item of old.items) {
      const next = nextById.get(item.id);
      if (!next) continue;
      const from = read(item);
      const to = read(next);
      if (from === to) continue;
      const text = (value: string | null) => {
        if (value == null) return '-';
        return multiple ? `${item.serviceTitle}: ${value}` : value;
      };
      changes.push({ field, from: text(from), to: text(to) });
    }
    return changes;
  }
}
