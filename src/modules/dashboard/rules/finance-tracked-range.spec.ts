import { PaymentTrackingMode } from '../../location/enums/payment-tracking-mode.enum.js';
import { trackedRange } from './finance-tracked-range.js';

const range = {
  locationId: 'location-1',
  from: new Date('2026-11-01T00:00:00.000Z'),
  to: new Date('2026-11-08T00:00:00.000Z'),
};
const manual = (since: string) => ({
  mode: PaymentTrackingMode.MANUAL,
  since: new Date(since),
});

describe('trackedRange', () => {
  it('is null when tracking is disabled', () => {
    expect(
      trackedRange(range, {
        mode: PaymentTrackingMode.DISABLED,
        since: new Date('2026-10-01T00:00:00.000Z'),
      }),
    ).toBeNull();
  });

  it('keeps the whole range when tracking started before it', () => {
    expect(trackedRange(range, manual('2026-10-01T00:00:00.000Z'))).toEqual(
      range,
    );
  });

  it('starts at the tracking start inside the range', () => {
    expect(trackedRange(range, manual('2026-11-03T09:30:00.000Z'))).toEqual({
      ...range,
      from: new Date('2026-11-03T09:30:00.000Z'),
    });
  });

  it('is null when tracking starts at the range end or later', () => {
    expect(trackedRange(range, manual('2026-11-08T00:00:00.000Z'))).toBeNull();
    expect(trackedRange(range, manual('2026-11-09T00:00:00.000Z'))).toBeNull();
  });
});
