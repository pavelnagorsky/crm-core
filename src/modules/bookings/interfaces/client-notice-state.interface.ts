import { Booking } from '@prisma/client';

export type ClientNoticeState = Pick<
  Booking,
  'clientNoticeAt' | 'clientNoticeType' | 'clientNoticeFromStartAt'
>;
