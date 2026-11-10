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
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const filesService = {
    findManyInUser: vi.fn(async (_userId: string, ids: string[]) =>
      ids.map((id) => ({ id })),
    ),
    findManyByIds: vi.fn().mockResolvedValue([]),
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
    const { db, filesService, service } = setup();
    await expectAppError(
      service.create(
        { message: 'Help', email: 'a@example.com', fileIds: [FILE_A] },
        null,
      ),
      'SUPPORT_ATTACHMENTS_REQUIRE_AUTH',
      HttpStatus.BAD_REQUEST,
    );
    expect(filesService.findManyInUser).not.toHaveBeenCalled();
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
          attachments: { create: [] },
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

  it('attaches only files owned by the caller, preserving order', async () => {
    const { db, filesService, service } = setup();
    await service.create(
      { message: 'Help', fileIds: [FILE_B, FILE_A] },
      'user-id',
    );
    expect(filesService.findManyInUser).toHaveBeenCalledWith('user-id', [
      FILE_B,
      FILE_A,
    ]);
    expect(db.supportRequest.create.mock.calls[0][0].data.attachments).toEqual({
      create: [
        { fileId: FILE_B, position: 0 },
        { fileId: FILE_A, position: 1 },
      ],
    });
  });

  it('maps a file deleted mid-request to FILE_NOT_FOUND', async () => {
    const { db, service } = setup();
    db.supportRequest.create.mockRejectedValue(
      knownError(PrismaErrorCode.FOREIGN_KEY_VIOLATION),
    );
    await expectAppError(
      service.create({ message: 'Help', fileIds: [FILE_A] }, 'user-id'),
      'FILE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
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

  it('loads attachment files through FilesService in stored order', async () => {
    const { db, filesService, service } = setup();
    db.supportRequest.findUnique.mockResolvedValue({
      id: 'id',
      attachments: [{ fileId: FILE_B }, { fileId: FILE_A }],
    });
    await service.findDetails('id');
    expect(filesService.findManyByIds).toHaveBeenCalledWith([FILE_B, FILE_A]);
  });
});
