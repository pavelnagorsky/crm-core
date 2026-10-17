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
import { BookingConfirmedNotification } from '../../notifications/messages/booking-confirmed.notification.js';
import { BookingStatusChangedNotification } from '../../notifications/messages/booking-status-changed.notification.js';
import { NOTIFICATION_EVENT } from '../../notifications/services/notifications.service.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingAuditInput } from '../interfaces/booking-audit-input.interface.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingClientTokenService } from './booking-client-token.service.js';

@Injectable()
export class BookingEventsService {
  private readonly logger = new Logger(BookingEventsService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly bookingClientService: BookingClientTokenService,
    private readonly locationService: LocationService,
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
        source: booking.source,
        executionMode: booking.executionMode,
        ...(bundleTitle ? { bundleTitle } : {}),
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  notifyCreated(booking: BookingWithItems, timezone: string): void {
    if (booking.status === BookingStatus.COMPLETED) return;
    if (!booking.clientEmail) return;
    const clientToken = this.bookingClientService.generateClientToken(
      booking.id,
    );
    this.eventEmitter.emit(
      NOTIFICATION_EVENT,
      new BookingConfirmedNotification(
        {
          id: booking.id,
          clientEmail: booking.clientEmail,
          clientFirstName: booking.clientFirstName,
          clientLastName: booking.clientLastName,
          serviceTitle: booking.items
            .map((item) => item.serviceTitle)
            .join(', '),
          staffName: [
            ...new Set(booking.items.map((item) => item.staffName)),
          ].join(', '),
          startAt: booking.startAt,
          endAt: booking.endAt,
          timezone,
        },
        clientToken,
      ),
    );
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
    status: 'CONFIRMED' | 'CANCELLED',
    reason?: string,
  ): Promise<void> {
    if (!booking.clientEmail) return;
    const { timezone } = await this.locationService.getLocale(
      booking.locationId,
    );
    this.eventEmitter.emit(
      NOTIFICATION_EVENT,
      new BookingStatusChangedNotification(
        {
          ...this.notificationData(booking),
          clientEmail: booking.clientEmail,
          timezone,
        },
        status,
        reason,
      ),
    );
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
