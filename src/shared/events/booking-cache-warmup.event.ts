export class BookingCacheWarmupEvent {
  static readonly eventName = 'booking.cache-warmup-requested';
  constructor(readonly locationId: string) {}
}
