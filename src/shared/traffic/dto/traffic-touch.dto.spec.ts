import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TrafficTouchDto } from './traffic-touch.dto.js';

function parse(plain: Record<string, unknown>): TrafficTouchDto {
  return plainToInstance(TrafficTouchDto, plain);
}

describe('TrafficTouchDto', () => {
  it('never fails validation on junk values', () => {
    const dto = parse({
      utmSource: 123,
      utmMedium: ['cpc'],
      utmCampaign: { a: 1 },
      utmContent: '\u0000\u0001',
      utmTerm: 'anna@example.com',
      gclid: null,
      referrerHost: 'x'.repeat(5000),
      touchedAt: 'not a date',
    });
    expect(validateSync(dto, { whitelist: true })).toEqual([]);
    expect(dto).toEqual(
      expect.objectContaining({
        utmSource: undefined,
        utmMedium: undefined,
        utmCampaign: undefined,
        utmContent: undefined,
        utmTerm: undefined,
        gclid: undefined,
        touchedAt: undefined,
      }),
    );
    expect(dto.referrerHost).toHaveLength(2048);
  });

  it('cuts values to the column limits and parses touchedAt', () => {
    const touchedAt = new Date(Date.now() - 60_000).toISOString();
    const dto = parse({
      utmSource: 's'.repeat(150),
      utmMedium: 'm'.repeat(150),
      utmCampaign: 'c'.repeat(200),
      utmContent: 'x'.repeat(200),
      utmTerm: 't'.repeat(200),
      ysclid: 'y'.repeat(300),
      touchedAt,
    });
    expect(validateSync(dto)).toEqual([]);
    expect(dto.utmSource).toHaveLength(100);
    expect(dto.utmMedium).toHaveLength(100);
    expect(dto.utmCampaign).toHaveLength(150);
    expect(dto.utmContent).toHaveLength(150);
    expect(dto.utmTerm).toHaveLength(150);
    expect(dto.ysclid).toHaveLength(255);
    expect(dto.touchedAt?.toISOString()).toBe(touchedAt);
  });
});
