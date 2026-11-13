import { Injectable } from '@nestjs/common';
import { labelOf } from '../../../../shared/i18n/label-of.js';
import {
  DEFAULT_LANG,
  LocaleService,
} from '../../../../shared/i18n/locale.service.js';
import { I18nLocale } from '../../../../shared/interfaces/i18n-locale.interface.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { XlsxColumn } from '../../../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { LocationService } from '../../../location/services/location.service.js';
import { ReviewWithVisit } from '../../interfaces/review-with-visit.interface.js';
import { ReviewModerationService } from '../../services/review-moderation.service.js';
import { ReviewExportRequestDto } from '../dto/review-export-request.dto.js';
import { ReviewExportRow } from '../interfaces/review-export-row.interface.js';

@Injectable()
export class ReviewsExportService {
  constructor(
    private readonly reviews: ReviewModerationService,
    private readonly locations: LocationService,
    private readonly locale: LocaleService,
  ) {}

  async stream(
    locationId: string,
    dto: ReviewExportRequestDto,
    lang = DEFAULT_LANG,
  ): Promise<XlsxFile> {
    const messages = this.locale.get(lang);
    const text = messages.documents.reviews;
    const columns: XlsxColumn<ReviewExportRow>[] = [
      { header: text.reviewedAt, key: 'reviewedAt' },
      { header: text.rating, key: 'rating' },
      { header: text.text, key: 'text', width: 60 },
      { header: text.authorFirstName, key: 'authorFirstName' },
      { header: text.authorLastName, key: 'authorLastName' },
      { header: text.staffNames, key: 'staffNames', width: 30 },
      { header: text.visitStartAt, key: 'visitStartAt' },
      { header: text.visitServices, key: 'visitServices', width: 40 },
      { header: text.status, key: 'status' },
      { header: text.hiddenReason, key: 'hiddenReason', width: 40 },
      { header: text.replyText, key: 'replyText', width: 60 },
      { header: text.repliedAt, key: 'repliedAt' },
      { header: text.repliedByName, key: 'repliedByName' },
      { header: text.source, key: 'source' },
    ];
    const [{ timezone }, { items }] = await Promise.all([
      this.locations.getLocale(locationId),
      this.reviews.search(locationId, {
        search: dto.search,
        staffId: dto.staffId,
        clientId: dto.clientId,
        replied: dto.replied,
        status: dto.status,
        rating: dto.rating,
        from: dto.from,
        to: dto.to,
        orderBy: dto.orderBy,
        orderDirection: dto.orderDirection,
        page: 1,
        pageSize: 1,
        isExport: true,
      }),
    ]);
    return XlsxUtils.table(
      items.map((review) => this.toRow(review, messages, timezone)),
      columns,
      'reviews',
      text.sheet,
      timezone,
    );
  }

  private toRow(
    review: ReviewWithVisit,
    messages: I18nLocale,
    timezone: string,
  ): ReviewExportRow {
    const dateTime = (date: Date | null | undefined) =>
      date ? TimeUtils.zonedDateTimeStr(date, timezone) : '';
    return {
      reviewedAt: dateTime(review.reviewedAt),
      rating: review.rating,
      text: review.text,
      authorFirstName: review.authorFirstName ?? '',
      authorLastName: review.authorLastName ?? '',
      staffNames: review.staff
        .map((staff) => staff.staffName)
        .sort((a, b) => a.localeCompare(b))
        .join(', '),
      visitStartAt: dateTime(review.visit?.startAt),
      visitServices: (review.visit?.services ?? [])
        .map((service) => service.name)
        .join(', '),
      status: labelOf(messages.reviewStatus, review.status),
      hiddenReason: review.hiddenReason ?? '',
      replyText: review.replyText ?? '',
      repliedAt: dateTime(review.repliedAt),
      repliedByName: review.repliedByName ?? '',
      source: review.source ?? '',
    };
  }
}
