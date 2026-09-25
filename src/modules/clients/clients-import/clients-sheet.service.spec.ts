import { isEmail } from 'class-validator';
import ExcelJS from 'exceljs';
import { CLIENT_IMPORT_MAX_BYTES, CLIENT_IMPORT_MAX_ROWS } from './clients-import.constants.js';
import { ClientsSheetService } from './clients-sheet.service.js';
import { ClientImportFileReason } from './enums/client-import-file-reason.enum.js';
import { ClientSheetColumn } from './enums/client-sheet-column.enum.js';
import { ClientImportUpload } from './interfaces/client-import-upload.interface.js';

const HEADERS = ['Имя', 'Фамилия', 'Телефон', 'Email', 'Дата рождения', 'Пол', 'Заметки'];

const service = new ClientsSheetService();

async function workbook(rows: unknown[][], headers = HEADERS): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Клиенты');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

function upload(buffer: Buffer, overrides: Partial<ClientImportUpload> = {}): ClientImportUpload {
  return {
    size: buffer.length,
    originalname: 'clients.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
    ...overrides,
  };
}

describe('ClientsSheetService', () => {
  it('rejects a missing, oversized, or non-xlsx file before reading it', async () => {
    await expect(service.read(undefined)).resolves.toEqual({ ok: false, reason: ClientImportFileReason.MISSING });
    await expect(service.read(upload(Buffer.alloc(0), { size: 0 }))).resolves.toEqual({
      ok: false,
      reason: ClientImportFileReason.MISSING,
    });

    const oversized = upload(Buffer.from('x'), { size: CLIENT_IMPORT_MAX_BYTES + 1 });
    await expect(service.read(oversized)).resolves.toEqual({ ok: false, reason: ClientImportFileReason.TOO_LARGE });

    const csv = upload(Buffer.from('a,b'), { originalname: 'clients.csv' });
    await expect(service.read(csv)).resolves.toEqual({ ok: false, reason: ClientImportFileReason.UNSUPPORTED_TYPE });
  });

  it('rejects a corrupt workbook, a sheet with no rows, and a sheet missing required columns', async () => {
    await expect(service.read(upload(Buffer.from('not-a-workbook')))).resolves.toEqual({
      ok: false,
      reason: ClientImportFileReason.CORRUPT,
    });

    const empty = upload(await workbook([]));
    await expect(service.read(empty)).resolves.toEqual({ ok: false, reason: ClientImportFileReason.EMPTY });

    const missingPhone = upload(await workbook([['Анна', 'Иванова']], ['Имя', 'Фамилия']));
    const result = await service.read(missingPhone);
    expect(result).toMatchObject({
      ok: false,
      reason: ClientImportFileReason.MISSING_COLUMNS,
    });
    if (!result.ok) expect(result.missingColumns).toContain(ClientSheetColumn.PHONE);
  });

  it('rejects a sheet over the row limit', async () => {
    const rows = Array.from({ length: CLIENT_IMPORT_MAX_ROWS + 1 }, (_, index) => [
      'Анна',
      'Иванова',
      `+37529${String(index).padStart(7, '0')}`,
    ]);
    const result = await service.read(upload(await workbook(rows)));
    expect(result).toEqual({ ok: false, reason: ClientImportFileReason.TOO_MANY_ROWS });
  });

  it('folds the same phone into one client and does not treat that repeat as a failure', async () => {
    expect(isEmail('anna@example.com')).toBe(true);
    const buffer = await workbook([
      ['', 'Иванова', '+375291112233'],
      ['Анна', 'Иванова', '375 29 111-22-33', 'anna@example.com', '01.02.1990', 'ж', 'постоянный'],
      ['Борис', 'Петров', '+375293334455', 'not-an-email'],
      ['Анна', 'Петрова', '+375291112233', 'other@example.com'],
      ['Вера', 'Сидорова', '8 029 111-00-00', '', '1991-03-04', 'Male'],
      ['Вера', 'Другая', '+375291110000', 'vera@example.com'],
      ['Глеб', 'Орлов', '80294445566'],
    ]);

    const result = await service.read(upload(buffer, { mimetype: 'application/octet-stream' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.invalidCount).toBe(2);
    expect(result.duplicateCount).toBe(2);
    expect(result.rows).toEqual([
      {
        firstName: 'Анна',
        lastName: 'Иванова',
        phone: '+375291112233',
        email: 'anna@example.com',
        birthDate: '1990-02-01',
        gender: 'FEMALE',
        notes: 'постоянный',
      },
      {
        firstName: 'Вера',
        lastName: 'Сидорова',
        phone: '+375291110000',
        email: 'vera@example.com',
        birthDate: '1991-03-04',
        gender: 'MALE',
        notes: null,
      },
      {
        firstName: 'Глеб',
        lastName: 'Орлов',
        phone: '+375294445566',
        email: null,
        birthDate: null,
        gender: null,
        notes: null,
      },
    ]);
  });
});
