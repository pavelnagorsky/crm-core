import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { File } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { FileBucket } from '../enums/file-bucket.enum.js';
import { FileStorageScope } from '../enums/file-storage-scope.enum.js';
import { FileStorageService } from './file-storage.service.js';

/** Public files with permanent links: logos, avatars, images, covers. */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: FileStorageService,
  ) {}

  async uploadForBrand(
    file: Express.Multer.File,
    userId: string,
    brandId: string,
  ): Promise<File> {
    const stored = await this.storage.save(
      FileBucket.PUBLIC,
      file,
      FileStorageScope.BRAND,
      brandId,
    );
    return this.db.file.create({
      data: {
        userId,
        url: this.storage.publicUrl(stored.storageKey),
        ...stored,
      },
    });
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
    try {
      await this.db.$transaction(
        async (tx) => {
          await tx.file.delete({ where: { id: file.id } });
          await this.storage.delete(FileBucket.PUBLIC, file.storageKey);
        },
        { timeout: 15000 },
      );
    } catch (err) {
      if (
        (err as { code?: string })?.code ===
        PrismaErrorCode.FOREIGN_KEY_VIOLATION
      )
        throw new AppException(ErrorCode.FILE_IN_USE, HttpStatus.CONFLICT);
      this.logger.error('File delete failed', err);
      throw new AppException(
        ErrorCode.FILE_DELETE_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private isInBrand(file: File, brandId: string): boolean {
    return file.storageKey.startsWith(`${FileStorageScope.BRAND}/${brandId}/`);
  }
}
