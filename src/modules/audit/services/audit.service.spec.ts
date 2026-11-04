import { AuditEntity, AuditEvent } from '@prisma/client';
import { AuditActionType } from '../enums/audit-action-type.enum.js';
import { AuditActorRole } from '../enums/audit-actor-role.enum.js';
import { AuditService } from './audit.service.js';

describe('AuditService lifecycle persistence', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  it.each([
    {
      entityType: AuditEntity.BRAND,
      eventType: AuditEvent.BRAND_CREATED,
      actionType: AuditActionType.CREATE,
    },
    {
      entityType: AuditEntity.BRAND,
      eventType: AuditEvent.BRAND_DELETED,
      actionType: AuditActionType.DELETE,
    },
    {
      entityType: AuditEntity.LOCATION,
      eventType: AuditEvent.LOCATION_CREATED,
      actionType: AuditActionType.CREATE,
    },
    {
      entityType: AuditEntity.LOCATION,
      eventType: AuditEvent.LOCATION_DELETED,
      actionType: AuditActionType.DELETE,
    },
  ])(
    'persists $eventType with the explicit brand scope without resolving active entities',
    async ({ entityType, eventType, actionType }) => {
      const create = vi.fn();
      const findUnique = vi.fn();
      const service = new AuditService(
        { auditLog: { create }, location: { findUnique } } as never,
        {} as never,
      );
      const locationId =
        entityType === AuditEntity.LOCATION ? 'location-1' : undefined;
      const occurredAt = new Date();
      await service.handleAuditEvent({
        brandId: 'brand-1',
        locationId,
        entityType,
        entityId: locationId ?? 'brand-1',
        eventType,
        actionType,
        occurredAt,
        actor: { id: 'user-1', name: 'Anna', role: AuditActorRole.OWNER },
        payload: { name: 'Studio' },
      });
      expect(findUnique).not.toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining(`event=${eventType}`),
      );
      expect(create).toHaveBeenCalledWith({
        data: {
          brandId: 'brand-1',
          locationId: locationId ?? null,
          entityType,
          entityId: locationId ?? 'brand-1',
          eventType,
          actionType,
          occurredAt,
          actorId: 'user-1',
          actorName: 'Anna',
          actorRole: AuditActorRole.OWNER,
          payload: { name: 'Studio' },
        },
      });
    },
  );

  it.each(['persistence', 'scope resolution', 'missing scope'])(
    'keeps a brief domain log and reports %s failures with entity context',
    async (failure) => {
      const error = new Error('database unavailable');
      const create = vi.fn().mockRejectedValue(error);
      const findUnique = vi.fn().mockRejectedValue(error);
      const service = new AuditService(
        { auditLog: { create }, location: { findUnique } } as never,
        {} as never,
      );

      await expect(
        service.handleAuditEvent({
          brandId: failure === 'persistence' ? 'brand-1' : undefined,
          locationId: failure === 'scope resolution' ? 'location-1' : undefined,
          entityType: AuditEntity.BRAND,
          entityId: 'brand-1',
          eventType: AuditEvent.BRAND_CREATED,
          actionType: AuditActionType.CREATE,
          occurredAt: new Date(),
          actor: {
            id: 'user-1',
            name: 'private actor name',
            role: AuditActorRole.OWNER,
          },
          payload: { name: 'private business name' },
        }),
      ).resolves.toBeUndefined();

      const logs = vi.mocked(Logger.prototype.log).mock.calls.flat().join(' ');
      expect(logs).toContain('event=BRAND_CREATED');
      expect(logs).toContain('entityId=brand-1');
      expect(logs).toContain('actorId=user-1');
      expect(logs).not.toContain('private');
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('entityId=brand-1'),
        ...(failure === 'missing scope' ? [] : [error.stack]),
      );
    },
  );

  it('logs access changes as staged inside the caller transaction', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const service = new AuditService({} as never, {} as never);
    await service.recordAccessChange(
      {
        id: 'audit-1',
        brandId: 'brand-1',
        locationId: null,
        actorId: 'user-1',
        action: 'GRANT',
        targetId: 'user-2',
        payload: { email: 'private@example.com' },
        createdAt: new Date(),
      },
      { id: 'user-1', name: 'private name', role: AuditActorRole.OWNER },
      { auditLog: { create } } as never,
    );

    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'audit staged: event=ACCESS_CHANGED action=GRANT entityId=user-2 brandId=brand-1 locationId=- actorId=user-1 auditId=audit-1',
    );
  });
});
import { Logger } from '@nestjs/common';
