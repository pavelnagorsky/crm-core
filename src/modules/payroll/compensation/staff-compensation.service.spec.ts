import type { CompensationPlanWithRates } from './interfaces/compensation-plan-with-rates.interface.js';
import { StaffCompensationService } from './staff-compensation.service.js';

describe('StaffCompensationService.resolveServicePercent', () => {
  const service = new StaffCompensationService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const plan = (overrides: Partial<CompensationPlanWithRates> = {}): CompensationPlanWithRates =>
    ({
      id: 'plan',
      serviceCommissionPercent: '30',
      serviceRates: [{ serviceId: 'haircut', commissionPercent: '40' }],
      ...overrides,
    }) as CompensationPlanWithRates;

  it('uses a per-service override when present', () => {
    expect(service.resolveServicePercent(plan(), 'haircut')).toBe('40');
  });

  it('falls back to the default service commission', () => {
    expect(service.resolveServicePercent(plan(), 'massage')).toBe('30');
  });

  it('returns null when neither override nor default exists', () => {
    expect(service.resolveServicePercent(plan({ serviceCommissionPercent: null, serviceRates: [] }), 'massage')).toBe(
      null,
    );
  });

  it('treats an explicit 0% override as a real rate', () => {
    expect(
      service.resolveServicePercent(
        plan({ serviceRates: [{ serviceId: 'intern', commissionPercent: '0' }] as never }),
        'intern',
      ),
    ).toBe('0');
  });
});
