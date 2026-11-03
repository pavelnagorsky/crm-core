import { AuditEntity, AuditEvent } from '@prisma/client';
import { AuditActionType } from '../enums/audit-action-type.enum.js';
import { AuditActorRole } from '../enums/audit-actor-role.enum.js';
import { AuditService } from './audit.service.js';

describe('AuditService lifecycle persistence', () => {
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
});
