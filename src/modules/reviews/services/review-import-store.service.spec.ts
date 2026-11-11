import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../database/database.service.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { ImportedReview } from '../interfaces/imported-review.interface.js';
import { ReviewAggregatesService } from './review-aggregates.service.js';
import { ReviewAuditService } from './review-audit.service.js';
import { ReviewImportStoreService } from './review-import-store.service.js';

const actor = { id: 'u1', name: 'Ольга', role: AuditActorRole.OWNER };

function imported(
  importKey: string,
  patch: Partial<ImportedReview> = {},
): ImportedReview {
  return {
    importKey,
    rating: 5,
    text: 'Отлично',
    authorFirstName: null,
    authorLastName: null,
    reviewedAt: new Date('2025-03-05T09:00:00Z'),
    source: 'YCLIENTS',
    replyText: null,
    staff: [],
    ...patch,
  };
}

function setup(lock = true) {
  const tx = {
    review: {
      createManyAndReturn: vi.fn(
        async ({ data }: { data: { id: string; importKey: string }[] }) =>
          data
            .filter((row) => row.importKey !== 'existing')
            .map(({ id, importKey }) => ({ id, importKey })),
      ),
    },
    reviewStaff: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const db = {
    $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  };
  const locations = {
    acquireActiveOperationLock: vi.fn().mockResolvedValue(lock),
  };
  const aggregates = { invalidateLocation: vi.fn() };
  const events = { emit: vi.fn() };
  const service = new ReviewImportStoreService(
    db as unknown as DatabaseService,
    locations as unknown as LocationService,
    aggregates as unknown as ReviewAggregatesService,
    new ReviewAuditService(events as unknown as EventEmitter2),
  );
  return { tx, db, locations, aggregates, events, service };
}

describe('ReviewImportStoreService', () => {
  it('inserts a batch under the location lock and skips existing keys', async () => {
    const { tx, locations, service } = setup();

    const inserted = await service.insertBatch('loc', 'batch-1', [
      imported('new', {
        replyText: 'Спасибо',
        staff: [
          { staffId: 's1', staffName: 'Мария' },
          { staffId: 's2', staffName: 'Ольга' },
        ],
      }),
      imported('existing', {
        staff: [{ staffId: 's1', staffName: 'Мария' }],
      }),
    ]);

    expect(inserted).toBe(1);
    expect(locations.acquireActiveOperationLock).toHaveBeenCalledWith(
      'loc',
      tx,
    );
    const call = tx.review.createManyAndReturn.mock.calls[0][0] as unknown as {
      data: Record<string, unknown>[];
      skipDuplicates: boolean;
    };
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({
      locationId: 'loc',
      importKey: 'new',
      importBatchId: 'batch-1',
      source: 'YCLIENTS',
      replyText: 'Спасибо',
      repliedAt: new Date('2025-03-05T09:00:00Z'),
      repliedByName: null,
    });
    expect(call.data[1]).toMatchObject({ replyText: null, repliedAt: null });
    const newId = call.data[0].id;
    expect(tx.reviewStaff.createMany).toHaveBeenCalledWith({
      data: [
        { reviewId: newId, staffId: 's1', staffName: 'Мария' },
        { reviewId: newId, staffId: 's2', staffName: 'Ольга' },
      ],
      skipDuplicates: true,
    });
  });

  it('collapses repeated keys within a batch to the first row', async () => {
    const { tx, service } = setup();

    await service.insertBatch('loc', 'batch-1', [
      imported('same', { rating: 5 }),
      imported('same', { rating: 1 }),
    ]);

    const call = tx.review.createManyAndReturn.mock.calls[0][0] as unknown as {
      data: { rating: number }[];
    };
    expect(call.data.map((row) => row.rating)).toEqual([5]);
  });

  it('fails without writing when the location is gone', async () => {
    const { tx, service } = setup(false);

    await expect(
      service.insertBatch('loc', 'batch-1', [imported('a')]),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.review.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('skips the transaction for an empty batch', async () => {
    const { db, service } = setup();
    await expect(service.insertBatch('loc', 'batch-1', [])).resolves.toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('resets summaries and records one audit entry after an import with new reviews', async () => {
    const { aggregates, events, service } = setup();
    const completion = {
      batchId: 'batch-1',
      fileName: 'reviews.xlsx',
      totalRows: 10,
      importedCount: 7,
      duplicateCount: 2,
      errorCount: 1,
    };

    await service.complete('loc', completion, actor);

    expect(aggregates.invalidateLocation).toHaveBeenCalledWith('loc');
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        locationId: 'loc',
        entityType: AuditEntity.REVIEW,
        entityId: 'batch-1',
        eventType: AuditEvent.REVIEW_IMPORT_COMPLETED,
        actor,
        payload: {
          fileName: 'reviews.xlsx',
          totalRows: 10,
          importedCount: 7,
          duplicateCount: 2,
          errorCount: 1,
        },
      }),
    );
  });

  it('leaves cache and audit alone when nothing was imported', async () => {
    const { aggregates, events, service } = setup();

    await service.complete(
      'loc',
      {
        batchId: 'batch-1',
        fileName: 'reviews.xlsx',
        totalRows: 3,
        importedCount: 0,
        duplicateCount: 3,
        errorCount: 0,
      },
      actor,
    );

    expect(aggregates.invalidateLocation).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
