import type { CompensationPlanWithRates } from '../interfaces/compensation-plan-with-rates.interface.js';
import { StaffCompensationService } from './staff-compensation.service.js';

describe('StaffCompensationService.resolveServicePercent', () => {
  const service = new StaffCompensationService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const plan = (
    overrides: Partial<CompensationPlanWithRates> = {},
  ): CompensationPlanWithRates =>
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
    expect(
      service.resolveServicePercent(
        plan({ serviceCommissionPercent: null, serviceRates: [] }),
        'massage',
      ),
    ).toBe(null);
  });

  it('treats an explicit 0% override as a real rate', () => {
    expect(
      service.resolveServicePercent(
        plan({
          serviceRates: [
            { serviceId: 'intern', commissionPercent: '0' },
          ] as never,
        }),
        'intern',
      ),
    ).toBe('0');
  });
});

describe('StaffCompensationService.replace commission base', () => {
  const actor = { name: 'Owner', role: 'OWNER' } as never;

  function setup() {
    const create = vi.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'plan-1', salaryMode: 'ADDITIVE', ...data }),
    );
    const db = {
      staffCompensationPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
        fn({ staffCompensationPlan: { create, update: vi.fn() } }),
      ),
    };
    const emit = vi.fn();
    const service = new StaffCompensationService(
      db as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'staff-1', locationId: 'loc-1' }),
      } as never,
      { assertServiceIdsInLocation: vi.fn() } as never,
      { getLocale: vi.fn().mockResolvedValue({ currency: 'RUB' }) } as never,
      { emit } as never,
    );
    return { service, create, emit };
  }

  it('defaults the commission base to CHARGED', async () => {
    const { service, create } = setup();
    await service.replace(
      'staff-1',
      { effectiveFrom: '2026-12-01', serviceCommissionPercent: '40' },
      actor,
    );
    expect(create.mock.calls[0][0].data.commissionBase).toBe('CHARGED');
  });

  it('stores the chosen commission base and puts it in the audit payload', async () => {
    const { service, create, emit } = setup();
    await service.replace(
      'staff-1',
      {
        effectiveFrom: '2026-12-01',
        serviceCommissionPercent: '40',
        commissionBase: 'LIST',
      } as never,
      actor,
    );
    expect(create.mock.calls[0][0].data.commissionBase).toBe('LIST');
    expect(emit.mock.calls[0][1].payload.commissionBase).toBe('LIST');
  });
});
