import { BookingChannel } from '@prisma/client';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { BookingChannelEvent } from '../../booking-channels/enums/booking-channel-event.enum.js';

/** A view or form open of a published booking page or widget, with the classified source. */
export interface TrafficChannelEvent {
  locationId: string;
  channel: BookingChannel;
  channelId: string;
  event: BookingChannelEvent;
  source: TrafficSource;
}
