import { AccessService } from './access.service.js';
import { AuditService } from '../../audit/services/audit.service.js';

describe('Access changes in the shared audit', () => {
  const tx = {
    accessState: { update: vi.fn() },
    accessAudit: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    brandMembership: { findUnique: vi.fn() },
  };
  const users = { findById: vi.fn() };
  const service = new AccessService(
    {} as never,
    {} as never,
    new AuditService({} as never, {} as never),
    users as never,
  );
  const change = {
    id: 'access-change',
    brandId: 'brand',
    locationId: 'location',
    actorId: 'owner',
    action: 'MEMBERSHIP_CHANGED',
    targetId: 'membership',
    payload: { previousRole: 'STAFF', role: 'MANAGER', userId: 'member' },
    createdAt: new Date(),
  };
  beforeEach(() => {
    vi.resetAllMocks();
    tx.accessAudit.create.mockResolvedValue(change);
    tx.brandMembership.findUnique.mockResolvedValue({ role: 'OWNER' });
    users.findById.mockResolvedValue({
      firstName: 'Anna',
      lastName: 'Owner',
      role: 'USER',
    });
  });

  it('writes both journals using the same transaction and a stable event ID', async () => {
    await service.recordChange(
      'brand',
      'owner',
      change.action,
      change.targetId,
      change.payload,
      tx as never,
      'location',
    );
    expect(users.findById).toHaveBeenCalledWith('owner', tx);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: change.id,
        brandId: 'brand',
        locationId: 'location',
        entityType: 'ACCESS',
        entityId: 'membership',
        eventType: 'ACCESS_CHANGED',
        actorId: 'owner',
        actorName: 'Anna Owner',
        actorRole: 'OWNER',
        occurredAt: change.createdAt,
        payload: expect.objectContaining({
          title: 'MEMBERSHIP_CHANGED',
          changes: expect.arrayContaining([
            expect.objectContaining({ field: 'previousRole', to: 'STAFF' }),
            expect.objectContaining({ field: 'role', to: 'MANAGER' }),
          ]),
        }),
      }),
    });
  });

  it('propagates an audit insert failure to the calling transaction', async () => {
    tx.auditLog.create.mockRejectedValue(new Error('Audit insert failed'));
    await expect(
      service.recordChange(
        'brand',
        'owner',
        change.action,
        change.targetId,
        change.payload,
        tx as never,
      ),
    ).rejects.toThrow('Audit insert failed');
  });
});
