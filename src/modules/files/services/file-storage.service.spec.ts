import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { FileBucket } from '../enums/file-bucket.enum.js';
import { FileStorageScope } from '../enums/file-storage-scope.enum.js';
import { FileStorageService } from './file-storage.service.js';

const gcs = vi.hoisted(() => {
  const file = {
    save: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example/x']),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const bucket = vi.fn(() => ({ file: vi.fn(() => file) }));
  return { file, bucket };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket = gcs.bucket;
  },
}));

function setup() {
  const config = {
    get: () => ({
      bucketName: 'public-bucket',
      privateBucketName: 'private-bucket',
      projectId: 'project',
    }),
  };
  const service = new FileStorageService(config as unknown as ConfigService);
  service.onModuleInit();
  return service;
}

const upload = (originalname: string, size = 100) =>
  ({
    originalname,
    size,
    mimetype: 'image/png',
    buffer: Buffer.from('x'),
  }) as Express.Multer.File;

describe('FileStorageService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks public uploads as immutable for long-term caching', async () => {
    const service = setup();
    const stored = await service.save(
      FileBucket.PUBLIC,
      upload('logo.png'),
      FileStorageScope.BRAND,
      'b1',
    );
    expect(gcs.bucket).toHaveBeenCalledWith('public-bucket');
    expect(gcs.file.save).toHaveBeenCalledWith(expect.any(Buffer), {
      metadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
      },
      resumable: false,
    });
    expect(service.publicUrl(stored.storageKey)).toMatch(
      /^https:\/\/storage\.googleapis\.com\/public-bucket\/brands\/b1\/files\/.+\.png$/,
    );
  });

  it('writes private uploads to the private bucket without public caching', async () => {
    const service = setup();
    const stored = await service.save(
      FileBucket.PRIVATE,
      upload('Скрин.PNG'),
      FileStorageScope.USER,
      'u1',
    );
    expect(gcs.bucket).toHaveBeenCalledWith('private-bucket');
    expect(gcs.file.save.mock.calls[0][1].metadata).toEqual({
      contentType: 'image/png',
    });
    expect(stored).toMatchObject({
      fileName: 'Скрин.PNG',
      mimeType: 'image/png',
      fileSizeBytes: 100,
    });
    expect(stored.storageKey).toMatch(/^users\/u1\/files\/.+\.png$/);
  });

  it.each([
    [
      'too large',
      upload('a.png', 15 * 1024 * 1024 + 1),
      HttpStatus.PAYLOAD_TOO_LARGE,
    ],
    ['blocked', upload('run.exe'), HttpStatus.UNPROCESSABLE_ENTITY],
  ])('rejects uploads before writing: %s', async (_, file, status) => {
    const service = setup();
    const error = await service
      .save(FileBucket.PRIVATE, file, FileStorageScope.USER, 'u1')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(status);
    expect(gcs.file.save).not.toHaveBeenCalled();
  });

  it('signs a short-lived read link that keeps the original file name', async () => {
    const service = setup();
    const before = Date.now();
    const signed = await service.signPrivateUrl(
      'users/u1/files/a.png',
      'Скрин 1.png',
    );
    expect(gcs.bucket).toHaveBeenCalledWith('private-bucket');
    const options = gcs.file.getSignedUrl.mock.calls[0][0];
    expect(options).toMatchObject({
      version: 'v4',
      action: 'read',
      responseDisposition: `inline; filename*=UTF-8''${encodeURIComponent('Скрин 1.png')}`,
    });
    expect(options.expires).toBe(signed.expiresAt);
    expect(signed.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      60 * 60 * 1000,
    );
    expect(signed.url).toBe('https://signed.example/x');
  });

  it('maps a storage failure on delete to FILE_DELETE_FAILED', async () => {
    const service = setup();
    gcs.file.delete.mockRejectedValueOnce(new Error('gcs down'));
    const error = await service
      .delete(FileBucket.PRIVATE, 'key')
      .catch((e: unknown) => e);
    expect((error as AppException).errorCode).toBe('FILE_DELETE_FAILED');
    expect(gcs.bucket).toHaveBeenCalledWith('private-bucket');
    expect(gcs.file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
});
