import { Storage } from '@google-cloud/storage';
import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { IGoogleCloudConfig } from '../../../config/interfaces/google-cloud-config.interface.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import {
  MAX_FILE_SIZE_BYTES,
  PRIVATE_FILE_URL_TTL_MS,
  PUBLIC_FILE_CACHE_CONTROL,
} from '../constants/files.constants.js';
import { BlockedFileExtension } from '../enums/blocked-file-extension.enum.js';
import { FileBucket } from '../enums/file-bucket.enum.js';
import { FileStorageScope } from '../enums/file-storage-scope.enum.js';
import { SignedFileUrl } from '../interfaces/signed-file-url.interface.js';
import { StoredFile } from '../interfaces/stored-file.interface.js';

/** Google Cloud Storage access shared by public and private files; private to FilesModule. */
@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly logger = new Logger(FileStorageService.name);
  private storage: Storage;
  private bucketNames: Record<FileBucket, string>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const gcsConfig = this.config.get<IGoogleCloudConfig>('googleCloud')!;
    this.bucketNames = {
      [FileBucket.PUBLIC]: gcsConfig.bucketName,
      [FileBucket.PRIVATE]: gcsConfig.privateBucketName,
    };
    // GOOGLE_APPLICATION_CREDENTIALS env var points to cloud-storage.json — Storage picks it up automatically.
    this.storage = new Storage({ projectId: gcsConfig.projectId });
  }

  /** Enforces the size limit and the extension blocklist before writing. */
  async save(
    bucket: FileBucket,
    file: Express.Multer.File,
    scope: FileStorageScope,
    ownerId: string,
  ): Promise<StoredFile> {
    const storageKey = `${scope}/${ownerId}/files/${randomUUID()}.${this.extensionOf(file)}`;
    try {
      await this.storage
        .bucket(this.bucketNames[bucket])
        .file(storageKey)
        .save(file.buffer, {
          metadata: {
            contentType: file.mimetype,
            ...(bucket === FileBucket.PUBLIC
              ? { cacheControl: PUBLIC_FILE_CACHE_CONTROL }
              : {}),
          },
          resumable: false,
        });
    } catch (err) {
      this.logger.error('GCS upload failed', err);
      throw new AppException(
        ErrorCode.FILE_UPLOAD_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return {
      storageKey,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
    };
  }

  publicUrl(storageKey: string): string {
    return `https://storage.googleapis.com/${this.bucketNames[FileBucket.PUBLIC]}/${storageKey}`;
  }

  /** Read-only link to a private object that expires; opens inline and keeps the original name on download. */
  async signPrivateUrl(
    storageKey: string,
    fileName: string,
  ): Promise<SignedFileUrl> {
    const expiresAt = new Date(Date.now() + PRIVATE_FILE_URL_TTL_MS);
    const [url] = await this.storage
      .bucket(this.bucketNames[FileBucket.PRIVATE])
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
  async delete(bucket: FileBucket, storageKey: string): Promise<void> {
    try {
      await this.storage
        .bucket(this.bucketNames[bucket])
        .file(storageKey)
        .delete({ ignoreNotFound: true });
    } catch (err) {
      this.logger.error('GCS delete failed', err);
      throw new AppException(
        ErrorCode.FILE_DELETE_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

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
}
