import { Prisma } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { ServicePricesService } from './service-prices.service.js';

const d = (value: string) => new Prisma.Decimal(value);
const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };

describe('ServicePricesService', () => {
  const events = { emit: vi.fn() };
  const cache = { invalidate: vi.fn() };
  const tx = {};
  const db = { $transaction: vi.fn() };
  const levels = {
    listLevels: vi.fn(),
    listLevelPricesForService: vi.fn(),
    listLevelPricesOfLevel: vi.fn(),
  };
  const levelsWrite = { setServiceLevelPrices: vi.fn() };
  const staff = {
    listServicePriceRows: vi.fn(),
    countByPriceLevel: vi.fn(),
    readServicePrices: vi.fn(),
    setPricesForService: vi.fn(),
    setServicePrices: vi.fn(),
    namesByIds: vi.fn(),
  };
  const catalog = {
    findServiceById: vi.fn(),
    findServicePriceEntries: vi.fn(),
  };
  const service = new ServicePricesService(
    db as never,
    levels as never,
    levelsWrite as never,
    staff as never,
    catalog as never,
    cache as never,
    events as never,
  );

  const member = (id: string, personalPrice: Prisma.Decimal | null) => ({
    staff: {
      id,
      name: `Staff ${id}`,
      status: 'ACTIVE',
      priceLevelId: null,
      avatarFile: null,
    },
    personalPrice,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((operation) => operation(tx));
    catalog.findServiceById.mockResolvedValue({
      id: 'cut',
      title: 'Cut',
      price: d('50'),
    });
    levels.listLevels.mockResolvedValue([]);
    levels.listLevelPricesForService.mockResolvedValue([]);
    staff.listServicePriceRows.mockResolvedValue([member('a', null)]);
    staff.countByPriceLevel.mockResolvedValue(new Map());
  });

  it('reads the prices of a service', async () => {
    const view = await service.getServicePrices('location', 'cut');
    expect(view.basePrice.toFixed(2)).toBe('50.00');
    expect(view.staff.map((row) => row.price.toFixed(2))).toEqual(['50.00']);
  });

  describe('level prices', () => {
    it('writes in a transaction, clears the cache and audits the changed prices', async () => {
      levelsWrite.setServiceLevelPrices.mockResolvedValue({
        before: new Map([['top', d('70')]]),
        names: new Map([
          ['top', 'Top'],
          ['mid', 'Mid'],
        ]),
      });
      await service.setLevelPrices(
        'location',
        'cut',
        {
          items: [
            { levelId: 'top', price: '80.00' },
            { levelId: 'mid', price: null },
          ],
        },
        actor,
      );
      expect(levelsWrite.setServiceLevelPrices).toHaveBeenCalledWith(
        'location',
        'cut',
        expect.any(Array),
        tx,
      );
      expect(cache.invalidate).toHaveBeenCalledWith(
        expect.stringContaining('location'),
      );
      expect(events.emit).toHaveBeenCalledWith(
        'audit',
        expect.objectContaining({
          entityType: 'SERVICE',
          entityId: 'cut',
          eventType: 'SERVICE_PRICES_UPDATED',
          payload: {
            title: 'Cut',
            levelChanges: [{ field: 'Top', from: '70.00', to: '80.00' }],
          },
        }),
      );
    });

    it('skips the audit event when nothing changed', async () => {
      levelsWrite.setServiceLevelPrices.mockResolvedValue({
        before: new Map([['top', d('80')]]),
        names: new Map([['top', 'Top']]),
      });
      await service.setLevelPrices(
        'location',
        'cut',
        { items: [{ levelId: 'top', price: '80.00' }] },
        actor,
      );
      expect(events.emit).not.toHaveBeenCalled();
      expect(cache.invalidate).toHaveBeenCalled();
    });
  });

  describe('staff prices of a service', () => {
    it('sets and resets personal prices, then audits them by staff name', async () => {
      staff.listServicePriceRows.mockResolvedValue([
        member('a', d('60')),
        member('b', null),
      ]);
      staff.setPricesForService.mockResolvedValue(
        new Map([
          ['a', d('60')],
          ['b', null],
        ]),
      );
      await service.setStaffPrices(
        'location',
        'cut',
        {
          items: [
            { staffId: 'a', price: null },
            { staffId: 'b', price: '75.00' },
          ],
        },
        actor,
      );
      expect(staff.setPricesForService).toHaveBeenCalledWith(
        'location',
        'cut',
        new Map([
          ['a', null],
          ['b', '75.00'],
        ]),
        tx,
      );
      expect(cache.invalidate).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'audit',
        expect.objectContaining({
          eventType: 'SERVICE_PRICES_UPDATED',
          payload: {
            title: 'Cut',
            staffChanges: [
              { field: 'Staff a', from: '60.00', to: '—' },
              { field: 'Staff b', from: '—', to: '75.00' },
            ],
          },
        }),
      );
    });

    it('keeps the cache and audit untouched when the assignment check fails', async () => {
      staff.setPricesForService.mockRejectedValue(new Error('not assigned'));
      await expect(
        service.setStaffPrices(
          'location',
          'cut',
          { items: [{ staffId: 'x', price: '1.00' }] },
          actor,
        ),
      ).rejects.toThrow('not assigned');
      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('prices of a staff member', () => {
    beforeEach(() => {
      staff.readServicePrices.mockResolvedValue({
        staffId: 'a',
        priceLevelId: 'top',
        items: [
          { serviceId: 'cut', personalPrice: null },
          { serviceId: 'dye', personalPrice: d('120') },
        ],
      });
      catalog.findServicePriceEntries.mockResolvedValue([
        { id: 'cut', title: 'Cut', price: d('50') },
        { id: 'dye', title: 'Dye', price: d('100') },
      ]);
      levels.listLevelPricesOfLevel.mockResolvedValue([
        { serviceId: 'cut', priceLevelId: 'top', price: d('80') },
      ]);
    });

    it('reads level and personal prices', async () => {
      const view = await service.getStaffServicePrices('location', 'a');
      expect(levels.listLevelPricesOfLevel).toHaveBeenCalledWith('top', [
        'cut',
        'dye',
      ]);
      expect(view.items.map((item) => item.price.toFixed(2))).toEqual([
        '80.00',
        '120.00',
      ]);
    });

    it('writes prices, clears the cache and audits by service title', async () => {
      staff.setServicePrices.mockResolvedValue(
        new Map([
          ['cut', null],
          ['dye', d('120')],
        ]),
      );
      staff.namesByIds.mockResolvedValue(new Map([['a', 'Anna']]));
      await service.setStaffServicePrices(
        'location',
        'a',
        {
          items: [
            { serviceId: 'cut', price: '90.00' },
            { serviceId: 'dye', price: null },
          ],
        },
        actor,
      );
      expect(staff.setServicePrices).toHaveBeenCalledWith(
        'location',
        'a',
        new Map([
          ['cut', '90.00'],
          ['dye', null],
        ]),
        tx,
      );
      expect(cache.invalidate).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'audit',
        expect.objectContaining({
          entityType: 'STAFF',
          entityId: 'a',
          eventType: 'STAFF_PRICES_UPDATED',
          payload: {
            title: 'Anna',
            changes: [
              { field: 'Cut', from: '—', to: '90.00' },
              { field: 'Dye', from: '120.00', to: '—' },
            ],
          },
        }),
      );
    });
  });
});
