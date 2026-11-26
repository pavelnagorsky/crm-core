import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FeedbackStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { FeedbackSearchRequestDto } from '../dto/feedback-search-request.dto.js';
import { EmailTemplate } from '../../notifications/enums/email-template.enum.js';
import { FeedbackForwardedNotification } from '../../notifications/messages/feedback-forwarded.notification.js';
import { FeedbackReceivedNotification } from '../../notifications/messages/feedback-received.notification.js';
import { NOTIFICATION_EVENT } from '../../notifications/services/notifications.service.js';
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
  db.feedback.create.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: 'feedback-id', ...data }),
  );
  const events = { emit: vi.fn() };
  const config = new ConfigService({
    emailConfig: { salesEmail: 'sales@klendo.example' },
    frontend: { domain: 'https://klendo.example' },
  });
  return {
    db,
    events,
    service: new FeedbackService(
      db as unknown as DatabaseService,
      events as unknown as EventEmitter2,
      config,
    ),
  };
}

describe('Feedback operations', () => {
  it.each([{}, { phone: null, email: null }, { phone: ' ', email: ' ' }])(
    'requires a contact before writing to the database: %j',
    async (contacts) => {
      const { db, events, service } = setup();
      await expect(
        service.create({ name: 'Pavel', ...contacts }),
      ).rejects.toThrow(BadRequestException);
      expect(db.feedback.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
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

  it('confirms to the author and forwards to sales with Reply-To the author', async () => {
    const { events, service } = setup();
    await service.create({
      name: 'Pavel',
      company: 'Studio',
      phone: '+375291234567',
      email: 'client@example.com',
      message: 'Demo please',
    });
    expect(events.emit).toHaveBeenCalledTimes(2);
    const [received, forwarded] = events.emit.mock.calls.map(
      ([event, notification]) => {
        expect(event).toBe(NOTIFICATION_EVENT);
        return notification;
      },
    );
    expect(received).toBeInstanceOf(FeedbackReceivedNotification);
    expect(received.emailTemplate).toBe(EmailTemplate.FEEDBACK_RECEIVED);
    expect(received.toEmail()).toEqual({
      to: 'client@example.com',
      data: {
        name: 'Pavel',
        company: 'Studio',
        phone: '+375291234567',
        email: 'client@example.com',
        message: 'Demo please',
      },
    });
    expect(forwarded).toBeInstanceOf(FeedbackForwardedNotification);
    expect(forwarded.toEmail()).toEqual({
      to: 'sales@klendo.example',
      data: expect.objectContaining({
        feedbackId: 'feedback-id',
        replyTo: 'client@example.com',
        adminLink: 'https://klendo.example/admin/feedback/feedback-id/',
      }),
    });
  });

  it('only forwards a phone-only request to sales, without Reply-To', async () => {
    const { events, service } = setup();
    await service.create({ name: 'Pavel', phone: '+375291234567' });
    expect(events.emit).toHaveBeenCalledTimes(1);
    const notification = events.emit.mock.calls[0][1];
    expect(notification).toBeInstanceOf(FeedbackForwardedNotification);
    expect(notification.toEmail().data.replyTo).toBeNull();
  });

  it('does not email when the request is not stored', async () => {
    const { db, events, service } = setup();
    db.feedback.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({ name: 'Pavel', email: 'a@example.com' }),
    ).rejects.toThrow('db down');
    expect(events.emit).not.toHaveBeenCalled();
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
