import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrivateFile } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import {
  PRIVATE_FILE_PURGE_BATCH,
  PRIVATE_FILE_UNATTACHED_TTL_MS,
} from '../constants/files.constants.js';
import { FileBucket } from '../enums/file-bucket.enum.js';
import { FileStorageScope } from '../enums/file-storage-scope.enum.js';
import { SignedPrivateFile } from '../interfaces/signed-private-file.interface.js';
import { FileStorageService } from './file-storage.service.js';

/**
 * Private files: readable only through short-lived signed links.
 * A file is uploaded unattached; the module that starts referencing it calls
 * `attach`, and from then on that module decides who sees it and when it is deleted.
 * Unattached files are purged after a day.
 */
@Injectable()
export class PrivateFilesService {
  private readonly logger = new Logger(PrivateFilesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: FileStorageService,
  ) {}

  async upload(
    file: Express.Multer.File,
    userId: string,
  ): Promise<SignedPrivateFile> {
    const stored = await this.storage.save(
      FileBucket.PRIVATE,
      file,
      FileStorageScope.USER,
      userId,
    );
    let created: PrivateFile;
    try {
      created = await this.db.privateFile.create({
        data: { userId, ...stored },
      });
    } catch (error) {
      await this.deleteObjectQuietly(stored.storageKey);
      throw error;
    }
    return this.sign(created);
  }

  /** Only the uploader can remove a file, and only before it is attached. */
  async deleteOwn(id: string, userId: string): Promise<void> {
    const file = await this.db.privateFile.findFirst({
      where: { id, userId },
    });
    if (!file) {
      throw new AppException(ErrorCode.FILE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const { count } = await this.db.privateFile.deleteMany({
      where: { id, attachedAt: null },
    });
    if (count === 0) {
      throw new AppException(ErrorCode.FILE_IN_USE, HttpStatus.CONFLICT);
    }
    await this.deleteObjectQuietly(file.storageKey);
  }

  /**
   * Marks the caller's unattached files as used so the purge keeps them.
   * Runs inside the caller's transaction; any missing, foreign or already
   * attached id fails the whole call with FILE_NOT_FOUND.
   */
  async attach(
    ids: string[],
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const { count } = await tx.privateFile.updateMany({
      where: { id: { in: unique }, userId, attachedAt: null },
      data: { attachedAt: new Date() },
    });
    if (count !== unique.length) {
      throw new AppException(ErrorCode.FILE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
  }

  /** Signed links in the given order; the caller has already checked access. Missing ids are skipped. */
  async signMany(ids: string[]): Promise<SignedPrivateFile[]> {
    if (!ids.length) return [];
    const files = await this.db.privateFile.findMany({
      where: { id: { in: ids } },
    });
    const byId = new Map(files.map((file) => [file.id, file]));
    return Promise.all(
      ids
        .map((id) => byId.get(id))
        .filter((file): file is PrivateFile => !!file)
        .map((file) => this.sign(file)),
    );
  }

  /** Deletes the records and their objects; called by the owning module when its entity goes away. */
  async deleteMany(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const files = await this.db.privateFile.findMany({
      where: { id: { in: ids } },
      select: { storageKey: true },
    });
    await this.db.privateFile.deleteMany({ where: { id: { in: ids } } });
    await Promise.all(
      files.map((file) => this.deleteObjectQuietly(file.storageKey)),
    );
  }

  /** Removes files uploaded but never attached; returns how many were purged. */
  async purgeUnattached(): Promise<number> {
    const stale = await this.db.privateFile.findMany({
      where: {
        attachedAt: null,
        createdAt: {
          lt: new Date(Date.now() - PRIVATE_FILE_UNATTACHED_TTL_MS),
        },
      },
      select: { id: true, storageKey: true },
      orderBy: { createdAt: 'asc' },
      take: PRIVATE_FILE_PURGE_BATCH,
    });
    let purged = 0;
    for (const file of stale) {
      // Skips a file that got attached since it was selected.
      const { count } = await this.db.privateFile.deleteMany({
        where: { id: file.id, attachedAt: null },
      });
      if (count === 0) continue;
      await this.deleteObjectQuietly(file.storageKey);
      purged += 1;
    }
    return purged;
  }

  private async sign(file: PrivateFile): Promise<SignedPrivateFile> {
    return {
      file,
      ...(await this.storage.signPrivateUrl(file.storageKey, file.fileName)),
    };
  }

  /** The row is gone already; a leftover private object is harmless, so storage errors are only logged. */
  private async deleteObjectQuietly(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(FileBucket.PRIVATE, storageKey);
    } catch {
      this.logger.warn(`Private object left in storage: ${storageKey}`);
    }
  }
}
