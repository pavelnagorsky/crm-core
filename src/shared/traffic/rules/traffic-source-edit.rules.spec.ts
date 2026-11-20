import { TrafficSource } from '../enums/traffic-source.enum.js';
import { TrafficSourceValue } from '../interfaces/traffic-source-value.interface.js';
import { editTrafficSource } from './traffic-source-edit.rules.js';

const current: TrafficSourceValue = {
  source: TrafficSource.REFERRAL,
  detail: 'анна',
};

describe('editTrafficSource', () => {
  it.each<
    [
      string,
      TrafficSource | null | undefined,
      string | null | undefined,
      TrafficSourceValue,
    ]
  >([
    ['keeps both when omitted', undefined, undefined, current],
    [
      'keeps the detail when the same source is sent',
      TrafficSource.REFERRAL,
      undefined,
      current,
    ],
    [
      'drops the detail of a changed source',
      TrafficSource.PHONE_CALL,
      undefined,
      { source: TrafficSource.PHONE_CALL, detail: null },
    ],
    [
      'takes a new detail, trimmed',
      undefined,
      '  мария ',
      { source: TrafficSource.REFERRAL, detail: 'мария' },
    ],
    [
      'clears a blank detail',
      undefined,
      '   ',
      { source: TrafficSource.REFERRAL, detail: null },
    ],
    ['clears both', null, null, { source: null, detail: null }],
    [
      'clears the source and its old detail',
      null,
      undefined,
      { source: null, detail: null },
    ],
  ])('%s', (_name, source, detail, expected) => {
    expect(editTrafficSource(current, source, detail)).toEqual(expected);
  });

  it.each<[TrafficSourceValue, TrafficSource | null | undefined]>([
    [{ source: null, detail: null }, undefined],
    [current, null],
  ])('rejects a detail without a source', (from, source) => {
    expect(() => editTrafficSource(from, source, 'x')).toThrow(
      expect.objectContaining({
        errorCode: 'TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE',
      }),
    );
  });
});
