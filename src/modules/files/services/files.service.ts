import { Storage } from '@google-cloud/storage';
import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { File } from '@prisma/client';
import { randomUUID } from 'crypto';
import { IGoogleCloudConfig } from '../../../config/interfaces/google-cloud-config.interface.js';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import {
  MAX_FILE_SIZE_BYTES,
  PRIVATE_FILE_URL_TTL_MS,
  PUBLIC_FILE_CACHE_CONTROL,
} from '../constants/files.constants.js';
import { BlockedFileExtension } from '../enums/blocked-file-extension.enum.js';
import { FileStorageScope } from '../enums/file-storage-scope.enum.js';
import { SignedFileUrl } from '../interfaces/signed-file-url.interface.js';
import { StoredPrivateFile } from '../interfaces/stored-private-file.interface.js';

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private storage: Storage;
  private bucketName: string;
  private privateBucketName: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const gcsConfig = this.config.get<IGoogleCloudConfig>('googleCloud')!;
    this.bucketName = gcsConfig.bucketName;
    this.privateBucketName = gcsConfig.privateBucketName;
    // GOOGLE_APPLICATION_CREDENTIALS env var points to cloud-storage.json — Storage picks it up automatically.
    this.storage = new Storage({ projectId: gcsConfig.projectId });
  }

  uploadForBrand(
    file: Express.Multer.File,
    userId: string,
    brandId: string,
  ): Promise<File> {
    return this.upload(file, userId, FileStorageScope.BRAND, brandId);
  }

  /** Writes to the private bucket; read back only through `signPrivateUrl`. */
  async uploadPrivate(
    file: Express.Multer.File,
    userId: string,
  ): Promise<StoredPrivateFile> {
    const storageKey = this.storageKey(
      FileStorageScope.USER,
      userId,
      this.extensionOf(file),
    );
    await this.save(this.privateBucketName, storageKey, file, {
      contentType: file.mimetype,
    });
    return {
      storageKey,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
    };
  }

  /** Read-only link that expires; opens inline in the browser and keeps the original name on download. */
  async signPrivateUrl(
    storageKey: string,
    fileName: string,
  ): Promise<SignedFileUrl> {
    const expiresAt = new Date(Date.now() + PRIVATE_FILE_URL_TTL_MS);
    const [url] = await this.storage
      .bucket(this.privateBucketName)
      .file(storageKey)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: expiresAt,
        responseDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      });
    return { url, expiresAt };
  }

  /** Missing objects are fine; storage errors surface as FILE_DELETE_FAILED. */
  async deletePrivate(storageKey: string): Promise<void> {
    try {
      await this.storage
        .bucket(this.privateBucketName)
        .file(storageKey)
        .delete({ ignoreNotFound: true });
    } catch (err) {
      this.logger.error('GCS private delete failed', err);
      throw new AppException(
        ErrorCode.FILE_DELETE_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findInBrand(brandId: string, fileId: string): Promise<File> {
    const file = await this.db.file.findUnique({ where: { id: fileId } });
    if (!file || !this.isInBrand(file, brandId)) {
      throw new AppException(ErrorCode.FILE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return file;
  }

  async findById(fileId: string): Promise<File> {
    const file = await this.db.file.findUnique({ where: { id: fileId } });
    if (!file) {
      throw new AppException(ErrorCode.FILE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return file;
  }

  async deleteInBrand(fileId: string, brandId: string): Promise<void> {
    const file = await this.findInBrand(brandId, fileId);
    await this.deleteFile(file);
  }

  private async deleteFile(file: File): Promise<void> {
    try {
      await this.db.$transaction(
        async (tx) => {
          await tx.file.delete({ where: { id: file.id } });
          await this.storage
            .bucket(this.bucketName)
            .file(file.storageKey)
            .delete({ ignoreNotFound: true });
        },
        { timeout: 15000 },
      );
    } catch (err) {
      if (
        (err as { code?: string })?.code ===
        PrismaErrorCode.FOREIGN_KEY_VIOLATION
      )
        throw new AppException(ErrorCode.FILE_IN_USE, HttpStatus.CONFLICT);
      this.logger.error('GCS delete failed', err);
      throw new AppException(
        ErrorCode.FILE_DELETE_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async upload(
    file: Express.Multer.File,
    userId: string,
    scope: FileStorageScope,
    ownerId: string,
  ): Promise<File> {
    const storageKey = this.storageKey(scope, ownerId, this.extensionOf(file));
    await this.save(this.bucketName, storageKey, file, {
      contentType: file.mimetype,
      cacheControl: PUBLIC_FILE_CACHE_CONTROL,
    });

    const url = `https://storage.googleapis.com/${this.bucketName}/${storageKey}`;

    return this.db.file.create({
      data: {
        userId,
        url,
        storageKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
      },
    });
  }

  /** Enforces the size limit and the extension blocklist. */
  private extensionOf(file: Express.Multer.File): string {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new AppException(
        ErrorCode.FILE_TOO_LARGE,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const ext =
      file.originalname
        .trim()
        .replace(/\.+$/, '')
        .split('.')
        .pop()
        ?.trim()
        .toLowerCase() || 'bin';

    const blockedExtensions = Object.values(BlockedFileExtension) as string[];
    if (blockedExtensions.includes(ext)) {
      throw new AppException(
        ErrorCode.FILE_INVALID_TYPE,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return ext;
  }

  private async save(
    bucketName: string,
    storageKey: string,
    file: Express.Multer.File,
    metadata: { contentType: string; cacheControl?: string },
  ): Promise<void> {
    try {
      await this.storage
        .bucket(bucketName)
        .file(storageKey)
        .save(file.buffer, { metadata, resumable: false });
    } catch (err) {
      this.logger.error('GCS upload failed', err);
      throw new AppException(
        ErrorCode.FILE_UPLOAD_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private storageKey(
    scope: FileStorageScope,
    ownerId: string,
    ext: string,
  ): string {
    return `${scope}/${ownerId}/files/${randomUUID()}.${ext}`;
  }

  private isInBrand(file: File, brandId: string): boolean {
    return file.storageKey.startsWith(`${FileStorageScope.BRAND}/${brandId}/`);
  }
}
