import { HttpStatus } from '@nestjs/common';
import { Prisma, SupportRequestStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { FilesService } from '../../files/services/files.service.js';
import { UserService } from '../../user/services/user.service.js';
import { SupportRequestSearchRequestDto } from '../dto/support-request-search-request.dto.js';
import { SupportService } from './support.service.js';

const FILE_A = '11111111-1111-4111-8111-111111111111';
const FILE_B = '22222222-2222-4222-8222-222222222222';

function setup() {
  const db = {
    supportRequest: {
      create: vi.fn().mockResolvedValue({ id: 'request-id', attachments: [] }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    supportAttachment: {
      create: vi.fn(async ({ data }) => ({ id: FILE_A, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? arg(db) : Promise.all(arg as unknown[]),
  );
  const filesService = {
    uploadPrivate: vi.fn().mockResolvedValue({
      storageKey: 'users/user-id/files/a.png',
      fileName: 'screen.png',
      mimeType: 'image/png',
      fileSizeBytes: 10,
    }),
    signPrivateUrl: vi.fn(async (key: string) => ({
      url: `https://signed/${key}`,
      expiresAt: new Date('2026-11-13T13:00:00Z'),
    })),
    deletePrivate: vi.fn().mockResolvedValue(undefined),
  };
  const userService = {
    findById: vi.fn().mockResolvedValue({ email: 'Account@Example.com' }),
  };
  const service = new SupportService(
    db as unknown as DatabaseService,
    filesService as unknown as FilesService,
    userService as unknown as UserService,
  );
  return { db, filesService, userService, service };
}

async function expectAppError(
  promise: Promise<unknown>,
  code: keyof typeof ErrorCode,
  status: HttpStatus,
) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).getStatus()).toBe(status);
  expect((error as AppException).errorCode).toBe(code);
}

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('failed', {
    code,
    clientVersion: 'test',
  });
}

describe('SupportService.create', () => {
  it.each([undefined, null, ''])(
    'requires an email from guests: %j',
    async (email) => {
      const { db, service } = setup();
      await expectAppError(
        service.create({ message: 'Help', email }, null),
        'SUPPORT_EMAIL_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
      expect(db.supportRequest.create).not.toHaveBeenCalled();
    },
  );

  it('rejects guest attachments before touching files or the database', async () => {
    const { db, service } = setup();
    await expectAppError(
      service.create(
        { message: 'Help', email: 'a@example.com', fileIds: [FILE_A] },
        null,
      ),
      'SUPPORT_ATTACHMENTS_REQUIRE_AUTH',
      HttpStatus.BAD_REQUEST,
    );
    expect(db.supportAttachment.updateMany).not.toHaveBeenCalled();
    expect(db.supportRequest.create).not.toHaveBeenCalled();
  });

  it('stores a guest request with the normalized email and trimmed message', async () => {
    const { db, userService, service } = setup();
    await service.create(
      { message: '  <b>Help</b>  ', email: ' Guest@Example.com ' },
      null,
    );
    expect(userService.findById).not.toHaveBeenCalled();
    expect(db.supportRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: null,
          email: 'guest@example.com',
          message: '<b>Help</b>',
        },
      }),
    );
  });

  it('snapshots the account email when a signed-in user leaves email empty', async () => {
    const { db, userService, service } = setup();
    await service.create({ message: 'Help', email: null }, 'user-id');
    expect(userService.findById).toHaveBeenCalledWith('user-id');
    expect(db.supportRequest.create.mock.calls[0][0].data).toMatchObject({
      userId: 'user-id',
      email: 'account@example.com',
    });
  });

  it('prefers an explicitly provided email over the account email', async () => {
    const { db, userService, service } = setup();
    await service.create(
      { message: 'Help', email: 'other@example.com' },
      'user-id',
    );
    expect(userService.findById).not.toHaveBeenCalled();
    expect(db.supportRequest.create.mock.calls[0][0].data.email).toBe(
      'other@example.com',
    );
  });

  it('requires an email when the account has none (phone-only sign-up)', async () => {
    const { userService, service } = setup();
    userService.findById.mockResolvedValue({ email: null });
    await expectAppError(
      service.create({ message: 'Help' }, 'user-id'),
      'SUPPORT_EMAIL_REQUIRED',
      HttpStatus.BAD_REQUEST,
    );
  });

  it('links own unsent attachments in the given order inside the transaction', async () => {
    const { db, service } = setup();
    const request = await service.create(
      { message: 'Help', fileIds: [FILE_B, FILE_A] },
      'user-id',
    );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(db.supportAttachment.updateMany.mock.calls).toEqual([
      [
        {
          where: { id: FILE_B, userId: 'user-id', supportRequestId: null },
          data: { supportRequestId: 'request-id', position: 0 },
        },
      ],
      [
        {
          where: { id: FILE_A, userId: 'user-id', supportRequestId: null },
          data: { supportRequestId: 'request-id', position: 1 },
        },
      ],
    ]);
    expect(request.attachments).toEqual([{ id: FILE_B }, { id: FILE_A }]);
  });

  it('fails with FILE_NOT_FOUND when an attachment is foreign, missing or already sent', async () => {
    const { db, service } = setup();
    db.supportAttachment.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expectAppError(
      service.create({ message: 'Help', fileIds: [FILE_A, FILE_B] }, 'user-id'),
      'FILE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  });
});

describe('SupportService attachments', () => {
  it('stores the upload privately and records it unlinked', async () => {
    const { db, filesService, service } = setup();
    const file = { originalname: 'screen.png' } as Express.Multer.File;
    await service.uploadAttachment(file, 'user-id');
    expect(filesService.uploadPrivate).toHaveBeenCalledWith(file, 'user-id');
    expect(db.supportAttachment.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        storageKey: 'users/user-id/files/a.png',
        fileName: 'screen.png',
        mimeType: 'image/png',
        fileSizeBytes: 10,
      },
    });
  });

  it('removes the stored object when the record cannot be saved', async () => {
    const { db, filesService, service } = setup();
    db.supportAttachment.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.uploadAttachment({} as Express.Multer.File, 'user-id'),
    ).rejects.toThrow('db down');
    expect(filesService.deletePrivate).toHaveBeenCalledWith(
      'users/user-id/files/a.png',
    );
  });

  it('deletes an own unsent attachment from the database and storage', async () => {
    const { db, filesService, service } = setup();
    db.supportAttachment.findFirst.mockResolvedValue({
      id: FILE_A,
      storageKey: 'key-a',
    });
    await service.deleteAttachment(FILE_A, 'user-id');
    expect(db.supportAttachment.findFirst).toHaveBeenCalledWith({
      where: { id: FILE_A, userId: 'user-id' },
    });
    expect(db.supportAttachment.deleteMany).toHaveBeenCalledWith({
      where: { id: FILE_A, supportRequestId: null },
    });
    expect(filesService.deletePrivate).toHaveBeenCalledWith('key-a');
  });

  it('refuses to delete a foreign or sent attachment', async () => {
    const { db, filesService, service } = setup();
    db.supportAttachment.findFirst.mockResolvedValueOnce(null);
    await expectAppError(
      service.deleteAttachment(FILE_A, 'user-id'),
      'FILE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
    db.supportAttachment.findFirst.mockResolvedValueOnce({
      id: FILE_A,
      storageKey: 'key-a',
    });
    db.supportAttachment.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expectAppError(
      service.deleteAttachment(FILE_A, 'user-id'),
      'FILE_IN_USE',
      HttpStatus.CONFLICT,
    );
    expect(filesService.deletePrivate).not.toHaveBeenCalled();
  });

  it('purges old unsent attachments and skips ones sent meanwhile', async () => {
    const { db, filesService, service } = setup();
    db.supportAttachment.findMany.mockResolvedValue([
      { id: FILE_A, storageKey: 'key-a' },
      { id: FILE_B, storageKey: 'key-b' },
    ]);
    db.supportAttachment.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(service.purgeOrphanAttachments()).resolves.toBe(1);
    const where = db.supportAttachment.findMany.mock.calls[0][0].where;
    expect(where.supportRequestId).toBeNull();
    expect(Date.now() - where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(
      24 * 60 * 60 * 1000 - 1000,
    );
    expect(filesService.deletePrivate.mock.calls).toEqual([['key-a']]);
  });

  it('keeps purging when storage refuses to delete an object', async () => {
    const { db, filesService, service } = setup();
    db.supportAttachment.findMany.mockResolvedValue([
      { id: FILE_A, storageKey: 'key-a' },
    ]);
    filesService.deletePrivate.mockRejectedValue(new Error('gcs down'));
    await expect(service.purgeOrphanAttachments()).resolves.toBe(1);
  });
});

describe('SupportService admin operations', () => {
  it('combines status and text search with pagination and a matching count', async () => {
    const { db, service } = setup();
    await service.search(
      Object.assign(new SupportRequestSearchRequestDto(), {
        page: 2,
        pageSize: 10,
        status: SupportRequestStatus.NEW,
        search: ' crash ',
      }),
    );
    const args = db.supportRequest.findMany.mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.where.status).toBe(SupportRequestStatus.NEW);
    expect(args.where.OR).toHaveLength(3);
    expect(db.supportRequest.count).toHaveBeenCalledWith({
      where: args.where,
    });
  });

  it('rejects an empty update', async () => {
    const { db, service } = setup();
    await expectAppError(
      service.update('id', {}),
      'SUPPORT_REQUEST_UPDATE_EMPTY',
      HttpStatus.BAD_REQUEST,
    );
    expect(db.supportRequest.update).not.toHaveBeenCalled();
  });

  it('sets resolvedAt when resolving and keeps the original time on repeat', async () => {
    const { db, service } = setup();
    db.supportRequest.findUnique.mockResolvedValue({ resolvedAt: null });
    await service.update('id', { status: SupportRequestStatus.RESOLVED });
    expect(
      db.supportRequest.update.mock.calls[0][0].data.resolvedAt,
    ).toBeInstanceOf(Date);

    const original = new Date('2026-11-01T00:00:00Z');
    db.supportRequest.findUnique.mockResolvedValue({ resolvedAt: original });
    await service.update('id', { status: SupportRequestStatus.RESOLVED });
    expect(db.supportRequest.update.mock.calls[1][0].data.resolvedAt).toBe(
      original,
    );
  });

  it('clears resolvedAt when reopening and leaves it untouched on notes-only updates', async () => {
    const { db, service } = setup();
    db.supportRequest.findUnique.mockResolvedValue({
      resolvedAt: new Date(),
    });
    await service.update('id', { status: SupportRequestStatus.IN_PROGRESS });
    expect(db.supportRequest.update.mock.calls[0][0].data.resolvedAt).toBe(
      null,
    );

    await service.update('id', { notes: '  ' });
    expect(db.supportRequest.update.mock.calls[1][0].data).toMatchObject({
      status: undefined,
      resolvedAt: undefined,
      notes: null,
    });
  });

  it('returns 404 for a missing request on update and delete', async () => {
    const { db, service } = setup();
    db.supportRequest.findUnique.mockResolvedValue(null);
    await expectAppError(
      service.update('id', { notes: 'x' }),
      'SUPPORT_REQUEST_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
    db.supportRequest.delete.mockRejectedValue(
      knownError(PrismaErrorCode.RECORD_NOT_FOUND),
    );
    await expectAppError(
      service.delete('id'),
      'SUPPORT_REQUEST_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  });

  it('returns attachments in sent order with signed links', async () => {
    const { db, filesService, service } = setup();
    db.supportRequest.findUnique.mockResolvedValue({
      id: 'id',
      attachments: [{ id: FILE_B }],
    });
    const attachment = { id: FILE_B, storageKey: 'key-b', fileName: 'b.png' };
    db.supportAttachment.findMany.mockResolvedValue([attachment]);
    const { files } = await service.findDetails('id');
    expect(db.supportAttachment.findMany).toHaveBeenCalledWith({
      where: { supportRequestId: 'id' },
      orderBy: { position: 'asc' },
    });
    expect(filesService.signPrivateUrl).toHaveBeenCalledWith('key-b', 'b.png');
    expect(files).toEqual([
      {
        attachment,
        url: 'https://signed/key-b',
        expiresAt: new Date('2026-11-13T13:00:00Z'),
      },
    ]);
  });

  it('deletes the attachment objects together with the request', async () => {
    const { db, filesService, service } = setup();
    db.supportAttachment.findMany.mockResolvedValue([
      { storageKey: 'key-a' },
      { storageKey: 'key-b' },
    ]);
    db.supportRequest.delete.mockResolvedValue({});
    await service.delete('id');
    expect(filesService.deletePrivate.mock.calls).toEqual([
      ['key-a'],
      ['key-b'],
    ]);
  });

  it('keeps attachment objects when the request does not exist', async () => {
    const { db, filesService, service } = setup();
    db.supportAttachment.findMany.mockResolvedValue([{ storageKey: 'key-a' }]);
    db.supportRequest.delete.mockRejectedValue(
      knownError(PrismaErrorCode.RECORD_NOT_FOUND),
    );
    await expect(service.delete('id')).rejects.toBeInstanceOf(AppException);
    expect(filesService.deletePrivate).not.toHaveBeenCalled();
  });
});
