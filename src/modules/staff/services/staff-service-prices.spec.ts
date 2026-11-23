import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createBillingFacadeStub } from '../../billing/testing/billing-facade.stub.js';
import { StaffService } from './staff.service.js';

const d = (value: string) => new Prisma.Decimal(value);

describe('Personal service prices of staff', () => {
  const db = {
    staff: { findFirst: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
    staffService: { findMany: vi.fn() },
  };
  const tx = {
    staff: { findFirst: vi.fn(), updateMany: vi.fn() },
    staffService: { findMany: vi.fn(), update: vi.fn() },
  };
  const service = new StaffService(
    db as never,
    { emit: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { invalidate: vi.fn() } as never,
    createBillingFacadeStub(),
  );

  beforeEach(() => vi.resetAllMocks());

  it('lists the staff of a service with their personal prices', async () => {
    db.staffService.findMany.mockResolvedValue([
      { price: d('60'), staff: { id: 'a', name: 'Anna' } },
      { price: null, staff: { id: 'b', name: 'Boris' } },
    ]);
    const rows = await service.listServicePriceRows('location', 'cut');
    expect(
      rows.map((row) => [row.staff.id, row.personalPrice?.toFixed(2)]),
    ).toEqual([
      ['a', '60.00'],
      ['b', undefined],
    ]);
    expect(db.staffService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          serviceId: 'cut',
          staff: expect.objectContaining({ locationId: 'location' }),
        }),
      }),
    );
  });

  it('reads the prices of one staff member and answers 404 for a foreign one', async () => {
    db.staff.findFirst.mockResolvedValueOnce({
      id: 'a',
      priceLevelId: 'top',
      staffServices: [{ serviceId: 'cut', price: d('60') }],
    });
    const prices = await service.readServicePrices('location', 'a');
    expect(prices.priceLevelId).toBe('top');
    expect(prices.items[0].personalPrice?.toFixed(2)).toBe('60.00');
    db.staff.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.readServicePrices('location', 'foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('setServicePrices', () => {
    it('writes each price and returns the previous ones', async () => {
      tx.staff.findFirst.mockResolvedValue({ id: 'a' });
      tx.staffService.findMany.mockResolvedValue([
        { serviceId: 'cut', price: d('60') },
        { serviceId: 'dye', price: null },
      ]);
      const before = await service.setServicePrices(
        'location',
        'a',
        new Map([
          ['cut', null],
          ['dye', '90.00'],
        ]),
        tx as never,
      );
      expect(tx.staffService.update).toHaveBeenCalledWith({
        where: { staffId_serviceId: { staffId: 'a', serviceId: 'cut' } },
        data: { price: null },
      });
      expect(tx.staffService.update).toHaveBeenCalledWith({
        where: { staffId_serviceId: { staffId: 'a', serviceId: 'dye' } },
        data: { price: '90.00' },
      });
      expect(before.get('cut')?.toFixed(2)).toBe('60.00');
    });

    it('rejects a service the staff member does not perform and writes nothing', async () => {
      tx.staff.findFirst.mockResolvedValue({ id: 'a' });
      tx.staffService.findMany.mockResolvedValue([
        { serviceId: 'cut', price: null },
      ]);
      await expect(
        service.setServicePrices(
          'location',
          'a',
          new Map([
            ['cut', '10.00'],
            ['dye', '20.00'],
          ]),
          tx as never,
        ),
      ).rejects.toMatchObject({
        errorCode: 'STAFF_SERVICE_NOT_ASSIGNED',
        status: 400,
      });
      expect(tx.staffService.update).not.toHaveBeenCalled();
    });

    it('answers 404 for a staff member of another location', async () => {
      tx.staff.findFirst.mockResolvedValue(null);
      await expect(
        service.setServicePrices(
          'location',
          'foreign',
          new Map([['cut', null]]),
          tx as never,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setPricesForService', () => {
    it('writes the personal price of each staff member of the service', async () => {
      tx.staffService.findMany.mockResolvedValue([
        { staffId: 'a', price: d('60') },
        { staffId: 'b', price: null },
      ]);
      const before = await service.setPricesForService(
        'location',
        'cut',
        new Map([
          ['a', null],
          ['b', '75.00'],
        ]),
        tx as never,
      );
      expect(tx.staffService.update).toHaveBeenCalledTimes(2);
      expect(tx.staffService.update).toHaveBeenCalledWith({
        where: { staffId_serviceId: { staffId: 'b', serviceId: 'cut' } },
        data: { price: '75.00' },
      });
      expect(before.get('a')?.toFixed(2)).toBe('60.00');
    });

    it('rejects a staff member who does not perform the service', async () => {
      tx.staffService.findMany.mockResolvedValue([]);
      await expect(
        service.setPricesForService(
          'location',
          'cut',
          new Map([['x', '10.00']]),
          tx as never,
        ),
      ).rejects.toMatchObject({ errorCode: 'STAFF_SERVICE_NOT_ASSIGNED' });
      expect(tx.staffService.update).not.toHaveBeenCalled();
    });
  });

  it('counts staff per level and moves the staff of a level to no level', async () => {
    db.staff.groupBy.mockResolvedValue([
      { priceLevelId: null, _count: { _all: 2 } },
      { priceLevelId: 'top', _count: { _all: 1 } },
    ]);
    const counts = await service.countByPriceLevel('location');
    expect(counts.get(null)).toBe(2);
    expect(counts.get('top')).toBe(1);
    await service.resetPriceLevel('top', tx as never);
    expect(tx.staff.updateMany).toHaveBeenCalledWith({
      where: { priceLevelId: 'top' },
      data: { priceLevelId: null },
    });
  });
});
