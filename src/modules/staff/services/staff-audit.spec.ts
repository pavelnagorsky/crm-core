import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { StaffService } from './staff.service.js';

describe('Staff assignments and shifts audit', () => {
  const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };
  const row = {
    id: 'staff',
    locationId: 'location',
    name: 'Anna',
    avatarFileId: null,
    staffServices: [{ serviceId: 'cut' }],
  };
  const events = { emit: vi.fn() };
  const tx = {
    staffShift: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const db = {
    staff: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  const service = new StaffService(
    db as never,
    events as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { invalidate: vi.fn() } as never,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    db.staff.findFirst.mockResolvedValue(row);
    db.staff.update.mockResolvedValue(row);
    db.$transaction.mockImplementation((operation) => operation(tx));
  });

  it('records assignment removal even when no staff profile fields change', async () => {
    await service.update('location', 'staff', { serviceIds: [] }, actor);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'STAFF_UPDATED',
        payload: {
          changes: [{ field: 'services', from: '["cut"]', to: '[]' }],
        },
      }),
    );
  });

  it('does not report a reordered service list as a change', async () => {
    db.staff.findFirst.mockResolvedValue({
      ...row,
      staffServices: [{ serviceId: 'wash' }, { serviceId: 'cut' }],
    });
    await service.update(
      'location',
      'staff',
      { serviceIds: ['cut', 'wash'] },
      actor,
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('records an avatar replacement', async () => {
    db.staff.update.mockResolvedValue({ ...row, avatarFileId: 'avatar' });
    await service.update(
      'location',
      'staff',
      { avatarFileId: 'avatar' },
      actor,
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        payload: {
          changes: [
            expect.objectContaining({ field: 'avatarFileId', to: 'avatar' }),
          ],
        },
      }),
    );
  });

  it('retains deleted shift times when the selected range is cleared', async () => {
    tx.staffShift.findMany.mockResolvedValue([
      {
        date: new Date('2026-11-04'),
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      },
    ]);
    const result = await service.replaceShifts(
      'location',
      'staff',
      { from: '2026-11-04', to: '2026-11-04', shifts: [] },
      actor,
    );
    expect(result).toEqual([]);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'STAFF_SHIFTS_UPDATED',
        payload: {
          startDate: '2026-11-04',
          endDate: '2026-11-04',
          before: [
            { date: '2026-11-04', startTime: '09:00', endTime: '18:00' },
          ],
          after: [],
        },
      }),
    );
  });

  it('does not record shifts if replacing them fails', async () => {
    tx.staffShift.findMany.mockResolvedValue([]);
    tx.staffShift.createMany.mockRejectedValue(new Error('Insert failed'));
    await expect(
      service.replaceShifts(
        'location',
        'staff',
        {
          from: '2026-11-04',
          to: '2026-11-04',
          shifts: [
            { date: '2026-11-04', startTime: '09:00', endTime: '18:00' },
          ],
        },
        actor,
      ),
    ).rejects.toThrow('Insert failed');
    expect(events.emit).not.toHaveBeenCalled();
  });
});
