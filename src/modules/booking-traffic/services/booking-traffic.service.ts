import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExclusiveCron } from '../../../shared/cron/decorators/exclusive-cron.decorator.js';
import { subMonths } from 'date-fns';
import { IFrontendConfig } from '../../../config/interfaces/frontend-config.interface.js';
import { DatabaseService } from '../../../database/database.service.js';
import { TRAFFIC_STAT_RETENTION_MONTHS } from '../../../shared/traffic/constants/traffic-limits.constants.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { ClassifiedTraffic } from '../../../shared/traffic/interfaces/classified-traffic.interface.js';
import { TrafficTouch } from '../../../shared/traffic/interfaces/traffic-touch.interface.js';
import { classifyTraffic } from '../../../shared/traffic/rules/traffic-classify.rules.js';
import { normalizeReferrerHost } from '../../../shared/traffic/rules/traffic-sanitize.rules.js';
import { BookingChannelEvent } from '../../booking-channels/enums/booking-channel-event.enum.js';
import { TrafficChannelEvent } from '../interfaces/traffic-channel-event.interface.js';
import { TrafficSourceViews } from '../interfaces/traffic-source-views.interface.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Classifies online visits by marketing source and owns BookingTrafficStat: hourly views and form
 * opens of booking pages and widgets per source.
 */
@Injectable()
export class BookingTrafficService {
  private readonly logger = new Logger(BookingTrafficService.name);
  private readonly ownHosts: string[];

  constructor(
    private readonly db: DatabaseService,
    config: ConfigService,
  ) {
    const domain = config.get<IFrontendConfig>('frontend')?.domain;
    const host = normalizeReferrerHost(domain);
    // A visit from our own pages (the booking page itself, the CRM) is not a source.
    this.ownHosts = host ? [host] : [];
  }

  classify(touch: TrafficTouch | null | undefined): ClassifiedTraffic {
    return classifyTraffic(touch, this.ownHosts);
  }

  /** Adds one view or form open to the source's counter of the current UTC hour. */
  async recordChannelEvent(
    event: TrafficChannelEvent,
    now = new Date(),
  ): Promise<void> {
    const hourStart = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
    const views = event.event === BookingChannelEvent.VIEW ? 1 : 0;
    const formOpens = event.event === BookingChannelEvent.FORM_OPEN ? 1 : 0;
    await this.db.$executeRaw`
      INSERT INTO "BookingTrafficStat"
        ("locationId", "hourStart", "channel", "channelId", "source", "views", "formOpens")
      VALUES (
        ${event.locationId},
        ${hourStart}::timestamptz AT TIME ZONE 'UTC',
        ${event.channel}::"BookingChannel",
        ${event.channelId},
        ${event.source}::"TrafficSource",
        ${views},
        ${formOpens}
      )
      ON CONFLICT ("locationId", "hourStart", "channelId", "source") DO UPDATE
      SET "views" = "BookingTrafficStat"."views" + EXCLUDED."views",
          "formOpens" = "BookingTrafficStat"."formOpens" + EXCLUDED."formOpens"
    `;
  }

  /** Views and form opens per source of the location's pages and widgets, hours in [from, to). */
  async trafficBySource(
    locationId: string,
    from: Date,
    to: Date,
  ): Promise<TrafficSourceViews[]> {
    const rows = await this.db.bookingTrafficStat.groupBy({
      by: ['source'],
      where: { locationId, hourStart: { gte: from, lt: to } },
      _sum: { views: true, formOpens: true },
    });
    return rows.map((row) => ({
      source: row.source as TrafficSource,
      views: row._sum.views ?? 0,
      formOpens: row._sum.formOpens ?? 0,
    }));
  }

  /** Monthly: drops hourly counters older than the retention period. */
  @ExclusiveCron('0 40 4 1 * *')
  async purgeExpiredStats(now = new Date()): Promise<number> {
    const { count } = await this.db.bookingTrafficStat.deleteMany({
      where: {
        hourStart: { lt: subMonths(now, TRAFFIC_STAT_RETENTION_MONTHS) },
      },
    });
    if (count > 0)
      this.logger.log(`Deleted ${count} booking traffic stat row(s)`);
    return count;
  }
}
