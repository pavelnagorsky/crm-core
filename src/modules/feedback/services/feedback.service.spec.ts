import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeedbackStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { FeedbackSearchRequestDto } from '../dto/feedback-search-request.dto.js';
import { FeedbackService } from './feedback.service.js';

function setup() {
  const db = {
    feedback: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  return { db, service: new FeedbackService(db as unknown as DatabaseService) };
}

describe('Feedback operations', () => {
  it.each([{}, { phone: null, email: null }, { phone: ' ', email: ' ' }])(
    'requires a contact before writing to the database: %j',
    (contacts) => {
      const { db, service } = setup();
      expect(() => service.create({ name: 'Pavel', ...contacts })).toThrow(
        BadRequestException,
      );
      expect(db.feedback.create).not.toHaveBeenCalled();
    },
  );

  it('normalizes empty optional text and ignores admin fields at the write boundary', async () => {
    const { db, service } = setup();
    const input = {
      name: ' Pavel ',
      email: ' Client@Example.com ',
      company: ' ',
      message: null,
      status: FeedbackStatus.DONE,
      notes: 'injected',
    };
    await service.create(input);
    expect(db.feedback.create).toHaveBeenCalledWith({
      data: {
        name: 'Pavel',
        email: 'client@example.com',
        phone: null,
        company: null,
        message: null,
      },
    });
  });

  it('combines status and text search with stable pagination and matching count', async () => {
    const { db, service } = setup();
    await service.search(
      Object.assign(new FeedbackSearchRequestDto(), {
        page: 2,
        pageSize: 10,
        search: ' client ',
        status: FeedbackStatus.NEW,
      }),
    );
    const args = db.feedback.findMany.mock.calls[0][0];
    expect(args).toMatchObject({
      skip: 10,
      take: 10,
      where: { status: FeedbackStatus.NEW },
      orderBy: [
        { createdAt: OrderDirection.DESC },
        { id: OrderDirection.DESC },
      ],
    });
    expect(args.where.OR).toContainEqual({
      notes: { contains: 'client', mode: 'insensitive' },
    });
    expect(db.feedback.count).toHaveBeenCalledWith({ where: args.where });
  });

  it('supports export without pagination', async () => {
    const { db, service } = setup();
    await service.search(
      Object.assign(new FeedbackSearchRequestDto(), { isExport: true }),
    );
    expect(db.feedback.findMany.mock.calls[0][0]).not.toHaveProperty('take');
    expect(db.feedback.findMany.mock.calls[0][0]).not.toHaveProperty('skip');
  });

  it('can clear notes without changing status and change status without erasing notes', async () => {
    const { db, service } = setup();
    await service.update('id', { notes: null });
    expect(db.feedback.update).toHaveBeenLastCalledWith({
      where: { id: 'id' },
      data: { notes: null, status: undefined },
    });
    await service.update('id', { status: FeedbackStatus.IN_PROGRESS });
    expect(db.feedback.update).toHaveBeenLastCalledWith({
      where: { id: 'id' },
      data: { status: FeedbackStatus.IN_PROGRESS, notes: undefined },
    });
  });

  it('rejects empty updates', async () => {
    const { db, service } = setup();
    await expect(service.update('id', {})).rejects.toThrow(BadRequestException);
    expect(db.feedback.update).not.toHaveBeenCalled();
  });

  it('returns 404 for missing records on read, update and delete', async () => {
    const { db, service } = setup();
    db.feedback.findUnique.mockResolvedValue(null);
    const missing = new Prisma.PrismaClientKnownRequestError('missing', {
      code: PrismaErrorCode.RECORD_NOT_FOUND,
      clientVersion: 'test',
    });
    db.feedback.update.mockRejectedValue(missing);
    db.feedback.delete.mockRejectedValue(missing);
    await expect(service.findById('id')).rejects.toThrow(NotFoundException);
    await expect(
      service.update('id', { status: FeedbackStatus.DONE }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.delete('id')).rejects.toThrow(NotFoundException);
  });

  it('propagates unexpected database failures', async () => {
    const { db, service } = setup();
    const failure = new Error('connection unavailable');
    db.feedback.delete.mockRejectedValue(failure);
    await expect(service.delete('id')).rejects.toBe(failure);
  });
});
