import { HttpStatus } from '@nestjs/common';
import { Prisma, SupportRequestStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PrivateFilesService } from '../../files/services/private-files.service.js';
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
    supportRequestAttachment: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? arg(db) : Promise.all(arg as unknown[]),
  );
  const privateFiles = {
    attach: vi.fn().mockResolvedValue(undefined),
    signMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue(undefined),
  };
  const userService = {
    findById: vi.fn().mockResolvedValue({ email: 'Account@Example.com' }),
  };
  const service = new SupportService(
    db as unknown as DatabaseService,
    privateFiles as unknown as PrivateFilesService,
    userService as unknown as UserService,
  );
  return { db, privateFiles, userService, service };
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
    const { db, privateFiles, service } = setup();
    await expectAppError(
      service.create(
        { message: 'Help', email: 'a@example.com', fileIds: [FILE_A] },
        null,
      ),
      'SUPPORT_ATTACHMENTS_REQUIRE_AUTH',
      HttpStatus.BAD_REQUEST,
    );
    expect(privateFiles.attach).not.toHaveBeenCalled();
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

  it('attaches own files and links them in the given order inside the transaction', async () => {
    const { db, privateFiles, service } = setup();
    const request = await service.create(
      { message: 'Help', fileIds: [FILE_B, FILE_A] },
      'user-id',
    );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(privateFiles.attach).toHaveBeenCalledWith(
      [FILE_B, FILE_A],
      'user-id',
      db,
    );
    expect(db.supportRequestAttachment.createMany).toHaveBeenCalledWith({
      data: [
        { supportRequestId: 'request-id', privateFileId: FILE_B, position: 0 },
        { supportRequestId: 'request-id', privateFileId: FILE_A, position: 1 },
      ],
    });
    expect(request.attachments).toEqual([
      { privateFileId: FILE_B },
      { privateFileId: FILE_A },
    ]);
  });

  it('does not link anything when attaching fails', async () => {
    const { db, privateFiles, service } = setup();
    privateFiles.attach.mockRejectedValue(
      new AppException(ErrorCode.FILE_NOT_FOUND, HttpStatus.NOT_FOUND),
    );
    await expectAppError(
      service.create({ message: 'Help', fileIds: [FILE_A] }, 'user-id'),
      'FILE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
    expect(db.supportRequestAttachment.createMany).not.toHaveBeenCalled();
  });

  it('skips attaching when there are no files', async () => {
    const { db, privateFiles, service } = setup();
    await service.create({ message: 'Help' }, 'user-id');
    expect(privateFiles.attach).not.toHaveBeenCalled();
    expect(db.supportRequestAttachment.createMany).not.toHaveBeenCalled();
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
    const { db, privateFiles, service } = setup();
    db.supportRequest.findUnique.mockResolvedValue({
      id: 'id',
      attachments: [{ privateFileId: FILE_B }, { privateFileId: FILE_A }],
    });
    const signed = [{ file: { id: FILE_B }, url: 'u', expiresAt: new Date() }];
    privateFiles.signMany.mockResolvedValue(signed);
    const { files } = await service.findDetails('id');
    expect(db.supportRequest.findUnique.mock.calls[0][0].include).toEqual({
      attachments: {
        select: { privateFileId: true },
        orderBy: { position: 'asc' },
      },
    });
    expect(privateFiles.signMany).toHaveBeenCalledWith([FILE_B, FILE_A]);
    expect(files).toBe(signed);
  });

  it('deletes the attached files together with the request', async () => {
    const { db, privateFiles, service } = setup();
    db.supportRequestAttachment.findMany.mockResolvedValue([
      { privateFileId: FILE_A },
      { privateFileId: FILE_B },
    ]);
    db.supportRequest.delete.mockResolvedValue({});
    await service.delete('id');
    expect(privateFiles.deleteMany).toHaveBeenCalledWith([FILE_A, FILE_B]);
  });

  it('keeps the files when the request does not exist', async () => {
    const { db, privateFiles, service } = setup();
    db.supportRequestAttachment.findMany.mockResolvedValue([
      { privateFileId: FILE_A },
    ]);
    db.supportRequest.delete.mockRejectedValue(
      knownError(PrismaErrorCode.RECORD_NOT_FOUND),
    );
    await expect(service.delete('id')).rejects.toBeInstanceOf(AppException);
    expect(privateFiles.deleteMany).not.toHaveBeenCalled();
  });
});
