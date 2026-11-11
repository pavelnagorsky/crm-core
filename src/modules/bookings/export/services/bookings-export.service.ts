import { Injectable } from '@nestjs/common';
import { labelOf } from '../../../../shared/i18n/label-of.js';
import {
  DEFAULT_LANG,
  LocaleService,
} from '../../../../shared/i18n/locale.service.js';
import { I18nLocale } from '../../../../shared/interfaces/i18n-locale.interface.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { XlsxColumn } from '../../../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { LocationService } from '../../../location/services/location.service.js';
import { BookingsFacade } from '../../bookings.facade.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { BookingExportRequestDto } from '../dto/booking-export-request.dto.js';

type BookingRow = {
  startAt: string;
  endAt: string;
  status: string;
  source: string;
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string;
  clientEmail: string;
  serviceTitle: string;
  serviceDuration: number;
  price: string;
  staffName: string;
  notes: string;
  internalNotes: string;
  cancellationReason: string;
  createdAt: string;
};

@Injectable()
export class BookingsExportService {
  constructor(
    private readonly bookings: BookingsFacade,
    private readonly locations: LocationService,
    private readonly locale: LocaleService,
  ) {}

  async stream(
    locationId: string,
    dto: BookingExportRequestDto,
    lang = DEFAULT_LANG,
  ): Promise<XlsxFile> {
    const messages = this.locale.get(lang);
    const text = messages.documents.bookings;
    const columns: XlsxColumn<BookingRow>[] = [
      { header: text.startAt, key: 'startAt' },
      { header: text.endAt, key: 'endAt' },
      { header: text.status, key: 'status' },
      { header: text.source, key: 'source' },
      { header: text.clientFirstName, key: 'clientFirstName' },
      { header: text.clientLastName, key: 'clientLastName' },
      { header: text.clientPhone, key: 'clientPhone', width: 18 },
      { header: text.clientEmail, key: 'clientEmail' },
      { header: text.serviceTitle, key: 'serviceTitle' },
      { header: text.serviceDuration, key: 'serviceDuration' },
      { header: text.price, key: 'price' },
      { header: text.staffName, key: 'staffName' },
      { header: text.notes, key: 'notes', width: 40 },
      { header: text.internalNotes, key: 'internalNotes', width: 40 },
      { header: text.cancellationReason, key: 'cancellationReason', width: 40 },
      { header: text.createdAt, key: 'createdAt' },
    ];
    const [{ timezone }, { items }] = await Promise.all([
      this.locations.getLocale(locationId),
      this.bookings.search(locationId, {
        search: dto.search,
        status: dto.status,
        staffIds: dto.staffIds,
        clientId: dto.clientId,
        catalogItemIds: dto.catalogItemIds,
        startFrom: dto.startFrom,
        startTo: dto.startTo,
        createdFrom: dto.createdFrom,
        createdTo: dto.createdTo,
        startDateFrom: dto.startDateFrom,
        startDateTo: dto.startDateTo,
        createdDateFrom: dto.createdDateFrom,
        createdDateTo: dto.createdDateTo,
        orderBy: dto.orderBy,
        orderDirection: dto.orderDirection,
        page: 1,
        pageSize: 1,
        isExport: true,
      }),
    ]);
    return XlsxUtils.table(
      items.flatMap((booking) => this.toRows(booking, messages, timezone)),
      columns,
      'bookings',
      text.sheet,
      timezone,
    );
  }

  private toRows(
    booking: BookingWithItems,
    messages: I18nLocale,
    timezone: string,
  ): BookingRow[] {
    return booking.items.map((item) => ({
      startAt: TimeUtils.zonedDateTimeStr(booking.startAt, timezone),
      endAt: TimeUtils.zonedDateTimeStr(booking.endAt, timezone),
      status: labelOf(messages.bookingStatus, booking.status),
      source: labelOf(messages.bookingSource, booking.source),
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      clientPhone: booking.clientPhone ?? '',
      clientEmail: booking.clientEmail ?? '',
      serviceTitle: item.serviceTitle,
      serviceDuration: item.serviceDuration,
      price: MoneyUtils.format(item.customPrice ?? item.chargedPrice),
      staffName: item.staffName,
      notes: booking.notes ?? '',
      internalNotes: booking.internalNotes ?? '',
      cancellationReason: booking.cancellationReason ?? '',
      createdAt: TimeUtils.zonedDateTimeStr(booking.createdAt, timezone),
    }));
  }
}
