import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ClientsImportService } from './clients-import.service.js';
import { ClientsService } from '../clients.service.js';
import { ClientsSheetService } from './clients-sheet.service.js';
import { ClientImportFileReason } from './enums/client-import-file-reason.enum.js';
import { ClientSheetColumn } from './enums/client-sheet-column.enum.js';
import { ClientImportRow } from './interfaces/client-import-row.interface.js';

function row(phone: string): ClientImportRow {
  return {
    firstName: 'Анна',
    lastName: 'Иванова',
    phone,
    email: null,
    birthDate: null,
    gender: null,
    notes: null,
  };
}

describe('ClientsImportService', () => {
  const clients = {
    findExistingPhones: vi.fn<(businessId: string, phones: string[]) => Promise<Set<string>>>(),
    insertImported: vi.fn<(businessId: string, rows: ClientImportRow[]) => Promise<number>>(),
  };
  const sheet = {
    read: vi.fn<ClientsSheetService['read']>(),
  };
  const service = new ClientsImportService(
    clients as unknown as ClientsService,
    sheet as unknown as ClientsSheetService,
  );

  beforeEach(() => {
    clients.findExistingPhones.mockReset();
    clients.insertImported.mockReset();
    sheet.read.mockReset();
  });

  it('rejects an unreadable file with an english error code and does not touch the database', async () => {
    sheet.read.mockResolvedValue({
      ok: false,
      reason: ClientImportFileReason.MISSING_COLUMNS,
      missingColumns: [ClientSheetColumn.PHONE],
    });

    const error = await service.import('business-1', undefined).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.errorCode).toBe(ErrorCode.CLIENT_IMPORT_MISSING_COLUMNS.code);
    expect(exception.message).toBe('Import file is missing required columns');
    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.payload).toEqual([ClientSheetColumn.PHONE]);
    expect(clients.findExistingPhones).not.toHaveBeenCalled();
    expect(clients.insertImported).not.toHaveBeenCalled();
  });

  it('inserts only a phone the business does not have yet and counts that client as imported', async () => {
    const fresh = row('+375291112233');
    const existing = row('+375292223344');
    sheet.read.mockResolvedValue({ ok: true, rows: [fresh, existing], invalidCount: 2, duplicateCount: 1 });
    clients.findExistingPhones.mockResolvedValue(new Set([existing.phone]));
    clients.insertImported.mockResolvedValue(1);

    const result = await service.import('business-1', undefined);

    expect(clients.findExistingPhones).toHaveBeenCalledWith('business-1', [fresh.phone, existing.phone]);
    expect(clients.insertImported).toHaveBeenCalledWith('business-1', [fresh]);
    expect(result).toEqual({ successCount: 1, duplicateCount: 2, errorCount: 2 });
  });

  it('does not query the database when every row is invalid', async () => {
    sheet.read.mockResolvedValue({ ok: true, rows: [], invalidCount: 5, duplicateCount: 0 });

    await expect(service.import('business-1', undefined)).resolves.toEqual({
      successCount: 0,
      duplicateCount: 0,
      errorCount: 5,
    });
    expect(clients.findExistingPhones).not.toHaveBeenCalled();
    expect(clients.insertImported).not.toHaveBeenCalled();
  });
});
