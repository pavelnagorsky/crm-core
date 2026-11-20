import { BookingChannel } from '@prisma/client';

export interface ChannelCount {
  channel: BookingChannel;
  count: number;
}
