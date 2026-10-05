import { Injectable } from '@nestjs/common';
import { XlsxColumn } from '../../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxService } from '../../../shared/xlsx/xlsx.service.js';
import { DEFAULT_LANG, LocaleService } from '../../../shared/i18n/locale.service.js';
import { labelOf } from '../../../shared/i18n/label-of.js';
import { I18nLocale } from '../../../shared/interfaces/i18n-locale.interface.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingsService } from '../bookings.service.js';
import { BookingExportRequestDto } from './dto/booking-export-request.dto.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';

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
    private readonly bookingsService: BookingsService,
    private readonly locale: LocaleService,
  ) {}

  async stream(businessId: string, dto: BookingExportRequestDto, lang = DEFAULT_LANG): Promise<XlsxFile> {
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
    const { items } = await this.bookingsService.search(businessId, {
      businessId,
      search: dto.search,
      status: dto.status,
      staffIds: dto.staffIds,
      clientId: dto.clientId,
      catalogItemIds: dto.catalogItemIds,
      startFrom: dto.startFrom,
      startTo: dto.startTo,
      createdFrom: dto.createdFrom,
      createdTo: dto.createdTo,
      orderBy: dto.orderBy,
      orderDirection: dto.orderDirection,
      page: 1,
      pageSize: 1,
      isExport: true,
    });
    return XlsxService.table(items.flatMap((booking) => this.toRows(booking, messages)), columns, 'bookings', text.sheet);
  }

  private toRows(booking: BookingWithItems, messages: I18nLocale): BookingRow[] {
    return booking.items.map((item) => ({
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: labelOf(messages.bookingStatus, booking.status),
      source: labelOf(messages.bookingSource, booking.source),
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      clientPhone: booking.clientPhone,
      clientEmail: booking.clientEmail ?? '',
      serviceTitle: item.serviceTitle,
      serviceDuration: item.serviceDuration,
      price: MoneyService.format(item.customPrice ?? item.chargedPrice),
      staffName: item.staffName,
      notes: booking.notes ?? '',
      internalNotes: booking.internalNotes ?? '',
      cancellationReason: booking.cancellationReason ?? '',
      createdAt: booking.createdAt.toISOString(),
    }));
  }
}
