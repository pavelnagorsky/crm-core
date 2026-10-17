import { OrderStatus, Prisma } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { OrderStateRules } from '../rules/order-state.rules.js';
import { OrderDraftMutationService } from './order-draft-mutation.service.js';

describe('OrderDraftMutationService transaction boundaries', () => {
  it.each(['update', 'addDraftItems'] as const)(
    'does not audit %s if the commit fails',
    async (operation) => {
      const order = {
        id: 'order',
        locationId: 'location',
        bookingId: null,
        status: OrderStatus.ACTIVE,
        version: 1,
        items: [],
        currency: 'BYN',
        totalAmount: new Prisma.Decimal(0),
      } as unknown as OrderWithItems;
      const tx = { order: { update: vi.fn() } };
      const audit = { record: vi.fn() };
      let changesWritten = false;
      const persistence = {
        inTransaction: async (run: (client: typeof tx) => Promise<unknown>) => {
          await run(tx);
          changesWritten = true;
          expect(audit.record).not.toHaveBeenCalled();
          throw new Error('commit failed');
        },
        findInTransaction: vi.fn().mockResolvedValue(order),
        incrementVersionIfCurrent: vi.fn().mockResolvedValue(true),
        lockOrder: vi.fn(),
        refreshTotals: vi.fn().mockResolvedValue(order),
      };
      const locations = {
        findById: vi.fn().mockResolvedValue({ brandId: 'brand' }),
      };
      const drafts = {
        resolveDraft: vi
          .fn()
          .mockResolvedValue({ location: { brandId: 'brand' }, items: [] }),
        resolveProductItemAdditions: vi
          .fn()
          .mockResolvedValue({ created: [], updated: [] }),
      };
      const service = new OrderDraftMutationService(
        locations as never,
        drafts as never,
        persistence as never,
        new OrderStateRules(),
        audit as never,
      );
      await expect(
        service[operation](
          'location',
          'order',
          { version: 1, items: [] },
          { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER },
        ),
      ).rejects.toThrow('commit failed');
      expect(changesWritten).toBe(true);
      expect(audit.record).not.toHaveBeenCalled();
    },
  );
});
