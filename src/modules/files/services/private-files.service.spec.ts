import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { FileBucket } from '../enums/file-bucket.enum.js';
import { FileStorageScope } from '../enums/file-storage-scope.enum.js';
import { FileStorageService } from './file-storage.service.js';
import { PrivateFilesService } from './private-files.service.js';

const FILE_A = '11111111-1111-4111-8111-111111111111';
const FILE_B = '22222222-2222-4222-8222-222222222222';
const EXPIRES_AT = new Date('2026-11-13T13:00:00Z');

function setup() {
  const db = {
    privateFile: {
      create: vi.fn(async ({ data }) => ({ id: FILE_A, ...data })),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = {
    save: vi.fn().mockResolvedValue({
      storageKey: 'users/user-id/files/a.png',
      fileName: 'screen.png',
      mimeType: 'image/png',
      fileSizeBytes: 10,
    }),
    signPrivateUrl: vi.fn(async (key: string) => ({
      url: `https://signed/${key}`,
      expiresAt: EXPIRES_AT,
    })),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const service = new PrivateFilesService(
    db as unknown as DatabaseService,
    storage as unknown as FileStorageService,
  );
  return { db, storage, service };
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

const tx = (db: ReturnType<typeof setup>['db']) =>
  db as unknown as Prisma.TransactionClient;

describe('PrivateFilesService', () => {
  it('stores the upload privately, records it unattached and returns a signed link', async () => {
    const { db, storage, service } = setup();
    const file = { originalname: 'screen.png' } as Express.Multer.File;
    const signed = await service.upload(file, 'user-id');
    expect(storage.save).toHaveBeenCalledWith(
      FileBucket.PRIVATE,
      file,
      FileStorageScope.USER,
      'user-id',
    );
    expect(db.privateFile.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        storageKey: 'users/user-id/files/a.png',
        fileName: 'screen.png',
        mimeType: 'image/png',
        fileSizeBytes: 10,
      },
    });
    expect(storage.signPrivateUrl).toHaveBeenCalledWith(
      'users/user-id/files/a.png',
      'screen.png',
    );
    expect(signed).toMatchObject({
      file: { id: FILE_A },
      url: 'https://signed/users/user-id/files/a.png',
      expiresAt: EXPIRES_AT,
    });
  });

  it('removes the stored object when the record cannot be saved', async () => {
    const { db, storage, service } = setup();
    db.privateFile.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.upload({} as Express.Multer.File, 'user-id'),
    ).rejects.toThrow('db down');
    expect(storage.delete).toHaveBeenCalledWith(
      FileBucket.PRIVATE,
      'users/user-id/files/a.png',
    );
  });

  it('deletes an own unattached file from the database and storage', async () => {
    const { db, storage, service } = setup();
    db.privateFile.findFirst.mockResolvedValue({
      id: FILE_A,
      storageKey: 'key-a',
    });
    await service.deleteOwn(FILE_A, 'user-id');
    expect(db.privateFile.findFirst).toHaveBeenCalledWith({
      where: { id: FILE_A, userId: 'user-id' },
    });
    expect(db.privateFile.deleteMany).toHaveBeenCalledWith({
      where: { id: FILE_A, attachedAt: null },
    });
    expect(storage.delete).toHaveBeenCalledWith(FileBucket.PRIVATE, 'key-a');
  });

  it('refuses to delete a foreign or attached file', async () => {
    const { db, storage, service } = setup();
    db.privateFile.findFirst.mockResolvedValueOnce(null);
    await expectAppError(
      service.deleteOwn(FILE_A, 'user-id'),
      'FILE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
    db.privateFile.findFirst.mockResolvedValueOnce({
      id: FILE_A,
      storageKey: 'key-a',
    });
    db.privateFile.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expectAppError(
      service.deleteOwn(FILE_A, 'user-id'),
      'FILE_IN_USE',
      HttpStatus.CONFLICT,
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('attaches only own unattached files through the given transaction', async () => {
    const { db, service } = setup();
    db.privateFile.updateMany.mockResolvedValue({ count: 2 });
    await service.attach([FILE_A, FILE_B], 'user-id', tx(db));
    const args = db.privateFile.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      id: { in: [FILE_A, FILE_B] },
      userId: 'user-id',
      attachedAt: null,
    });
    expect(args.data.attachedAt).toBeInstanceOf(Date);
  });

  it('fails with FILE_NOT_FOUND when a file is foreign, missing or already attached', async () => {
    const { db, service } = setup();
    db.privateFile.updateMany.mockResolvedValue({ count: 1 });
    await expectAppError(
      service.attach([FILE_A, FILE_B], 'user-id', tx(db)),
      'FILE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  });

  it('signs files in the requested order and skips missing ones', async () => {
    const { db, service } = setup();
    db.privateFile.findMany.mockResolvedValue([
      { id: FILE_A, storageKey: 'key-a', fileName: 'a.png' },
      { id: FILE_B, storageKey: 'key-b', fileName: 'b.png' },
    ]);
    const signed = await service.signMany([FILE_B, 'gone', FILE_A]);
    expect(signed.map((item) => item.file.id)).toEqual([FILE_B, FILE_A]);
    expect(signed[0].url).toBe('https://signed/key-b');
  });

  it('deletes records and objects of the given files', async () => {
    const { db, storage, service } = setup();
    db.privateFile.findMany.mockResolvedValue([
      { storageKey: 'key-a' },
      { storageKey: 'key-b' },
    ]);
    await service.deleteMany([FILE_A, FILE_B]);
    expect(db.privateFile.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [FILE_A, FILE_B] } },
    });
    expect(storage.delete.mock.calls).toEqual([
      [FileBucket.PRIVATE, 'key-a'],
      [FileBucket.PRIVATE, 'key-b'],
    ]);
  });

  it('purges old unattached files and skips ones attached meanwhile', async () => {
    const { db, storage, service } = setup();
    db.privateFile.findMany.mockResolvedValue([
      { id: FILE_A, storageKey: 'key-a' },
      { id: FILE_B, storageKey: 'key-b' },
    ]);
    db.privateFile.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(service.purgeUnattached()).resolves.toBe(1);
    const where = db.privateFile.findMany.mock.calls[0][0].where;
    expect(where.attachedAt).toBeNull();
    expect(Date.now() - where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(
      24 * 60 * 60 * 1000 - 1000,
    );
    expect(storage.delete.mock.calls).toEqual([[FileBucket.PRIVATE, 'key-a']]);
  });

  it('keeps purging when storage refuses to delete an object', async () => {
    const { db, storage, service } = setup();
    db.privateFile.findMany.mockResolvedValue([
      { id: FILE_A, storageKey: 'key-a' },
    ]);
    storage.delete.mockRejectedValue(new Error('gcs down'));
    await expect(service.purgeUnattached()).resolves.toBe(1);
  });
});
