import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode, ErrorCodeEntry } from '../../../shared/validation/error-codes.enum.js';
import { ClientsService } from '../clients.service.js';
import { ClientsSheetService } from './clients-sheet.service.js';
import { ClientImportFileReason } from './enums/client-import-file-reason.enum.js';
import { ClientImportResult } from './interfaces/client-import-result.interface.js';
import { ClientImportUpload } from './interfaces/client-import-upload.interface.js';
import { ClientSheetReadResult } from './interfaces/client-sheet-read-result.interface.js';

const FILE_ERRORS: Record<ClientImportFileReason, { entry: ErrorCodeEntry; status: HttpStatus }> = {
  [ClientImportFileReason.MISSING]: {
    entry: ErrorCode.CLIENT_IMPORT_FILE_MISSING,
    status: HttpStatus.BAD_REQUEST,
  },
  [ClientImportFileReason.TOO_LARGE]: {
    entry: ErrorCode.CLIENT_IMPORT_FILE_TOO_LARGE,
    status: HttpStatus.PAYLOAD_TOO_LARGE,
  },
  [ClientImportFileReason.UNSUPPORTED_TYPE]: {
    entry: ErrorCode.CLIENT_IMPORT_FILE_UNSUPPORTED,
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  [ClientImportFileReason.CORRUPT]: {
    entry: ErrorCode.CLIENT_IMPORT_FILE_CORRUPT,
    status: HttpStatus.BAD_REQUEST,
  },
  [ClientImportFileReason.MISSING_COLUMNS]: {
    entry: ErrorCode.CLIENT_IMPORT_MISSING_COLUMNS,
    status: HttpStatus.BAD_REQUEST,
  },
  [ClientImportFileReason.EMPTY]: {
    entry: ErrorCode.CLIENT_IMPORT_FILE_EMPTY,
    status: HttpStatus.BAD_REQUEST,
  },
  [ClientImportFileReason.TOO_MANY_ROWS]: {
    entry: ErrorCode.CLIENT_IMPORT_TOO_MANY_ROWS,
    status: HttpStatus.BAD_REQUEST,
  },
};

@Injectable()
export class ClientsImportService {
  constructor(
    private readonly clients: ClientsService,
    private readonly sheet: ClientsSheetService,
  ) {}

  async import(businessId: string, file: ClientImportUpload | undefined): Promise<ClientImportResult> {
    const read = await this.sheet.read(file);
    if (!read.ok) this.rejectFile(read);

    const existing = read.rows.length
      ? await this.clients.findExistingPhones(businessId, read.rows.map((row) => row.phone))
      : new Set<string>();
    const fresh = read.rows.filter((row) => !existing.has(row.phone));
    const inserted = fresh.length ? await this.clients.insertImported(businessId, fresh) : 0;

    return {
      successCount: inserted,
      duplicateCount: read.duplicateCount + (read.rows.length - inserted),
      errorCount: read.invalidCount,
    };
  }

  private rejectFile(failure: Extract<ClientSheetReadResult, { ok: false }>): never {
    const mapped = FILE_ERRORS[failure.reason];
    const payload = failure.reason === ClientImportFileReason.MISSING_COLUMNS ? failure.missingColumns ?? null : null;
    throw new AppException(mapped.entry, mapped.status, payload);
  }
}
