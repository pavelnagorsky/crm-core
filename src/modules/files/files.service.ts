import { Injectable, HttpStatus, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { IGoogleCloudConfig } from '../../config/configuration.js';
import { AllowedMimeType } from './enums/allowed-mime-type.enum.js';
import { randomUUID } from 'crypto';
import { File } from '@prisma/client';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private storage: Storage;
  private bucketName: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const gcsConfig = this.config.get<IGoogleCloudConfig>('googleCloud')!;
    this.bucketName = gcsConfig.bucketName;
    // GOOGLE_APPLICATION_CREDENTIALS env var points to cloud-storage.json — Storage picks it up automatically.
    this.storage = new Storage({ projectId: gcsConfig.projectId });
  }

  async upload(
    file: Express.Multer.File,
    userId: string,
    businessId: string,
  ): Promise<File> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new AppException(
        ErrorCode.FILE_TOO_LARGE,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const mimeType = file.mimetype as AllowedMimeType;
    if (!Object.values(AllowedMimeType).includes(mimeType)) {
      throw new AppException(
        ErrorCode.FILE_INVALID_TYPE,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const ext = file.originalname.split('.').pop() ?? 'bin';
    const storageKey = `businesses/${businessId}/files/${randomUUID()}.${ext}`;

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const gcsFile = bucket.file(storageKey);
      await gcsFile.save(file.buffer, {
        metadata: { contentType: file.mimetype },
        resumable: false,
      });
    } catch (err) {
      this.logger.error('GCS upload failed', err);
      throw new AppException(
        ErrorCode.FILE_UPLOAD_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

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

  async delete(fileId: string, businessId: string): Promise<void> {
    const file = await this.db.file.findUnique({ where: { id: fileId } });

    if (!file || !file.storageKey.startsWith(`businesses/${businessId}/`)) {
      throw new AppException(ErrorCode.FILE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    try {
      await this.storage.bucket(this.bucketName).file(file.storageKey).delete();
    } catch (err) {
      this.logger.error('GCS delete failed', err);
      throw new AppException(
        ErrorCode.FILE_DELETE_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    await this.db.file.delete({ where: { id: fileId } });
  }
}
