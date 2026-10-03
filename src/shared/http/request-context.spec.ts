import { Request } from 'express';
import { clientIp } from './request-context.js';

describe('clientIp', () => {
  it('ignores a client-supplied forwarded header', () => {
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4' },
      ip: '10.0.0.8',
      ips: [],
    } as unknown as Request;
    expect(clientIp(req)).toBe('10.0.0.8');
  });

  it('uses the trusted proxy hop when express already parsed it', () => {
    const req = {
      headers: {},
      ip: '10.0.0.1',
      ips: ['203.0.113.5', '10.0.0.1'],
    } as unknown as Request;
    expect(clientIp(req)).toBe('203.0.113.5');
  });
});
