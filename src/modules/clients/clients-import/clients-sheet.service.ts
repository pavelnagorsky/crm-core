import { Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { format, isValid, parse } from 'date-fns';
import { canonicalPhone } from '../../../shared/phone/canonical-phone.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { XlsxCells } from '../../../shared/xlsx/interfaces/xlsx-cells.interface.js';
import { XlsxService } from '../../../shared/xlsx/xlsx.service.js';
import { CLIENT_IMPORT_MAX_BYTES, CLIENT_IMPORT_MAX_ROWS } from './clients-import.constants.js';
import { ClientImportFileReason } from './enums/client-import-file-reason.enum.js';
import { CLIENT_SHEET_COLUMNS, ClientSheetColumn } from './enums/client-sheet-column.enum.js';
import { ClientImportRow } from './interfaces/client-import-row.interface.js';
import { ClientImportUpload } from './interfaces/client-import-upload.interface.js';
import { ClientSheetReadResult } from './interfaces/client-sheet-read-result.interface.js';

const NAME_MAX = 100;
const EMAIL_MAX = 254;
const GENDER_MAX = 20;
const NOTES_MAX = 1000;
const BIRTH_YEAR_MIN = 1900;

const REQUIRED_COLUMNS: readonly ClientSheetColumn[] = [
  ClientSheetColumn.FIRST_NAME,
  ClientSheetColumn.LAST_NAME,
  ClientSheetColumn.PHONE,
];

const HEADER_ALIASES: Record<ClientSheetColumn, readonly string[]> = {
  [ClientSheetColumn.FIRST_NAME]: ['имя', 'firstname', 'first name'],
  [ClientSheetColumn.LAST_NAME]: ['фамилия', 'lastname', 'last name'],
  [ClientSheetColumn.PHONE]: ['телефон', 'phone', 'тел'],
  [ClientSheetColumn.EMAIL]: ['email', 'e-mail', 'почта'],
  [ClientSheetColumn.BIRTH_DATE]: ['дата рождения', 'birthdate', 'birth date', 'др'],
  [ClientSheetColumn.GENDER]: ['пол', 'gender'],
  [ClientSheetColumn.NOTES]: ['заметки', 'notes', 'примечание', 'комментарий'],
};

const GENDER_TO_CODE: Record<string, string> = {
  мужской: 'MALE',
  муж: 'MALE',
  м: 'MALE',
  male: 'MALE',
  m: 'MALE',
  женский: 'FEMALE',
  жен: 'FEMALE',
  ж: 'FEMALE',
  female: 'FEMALE',
  f: 'FEMALE',
};

type SheetCells = Record<ClientSheetColumn, string>;

@Injectable()
export class ClientsSheetService {
  async read(file: ClientImportUpload | undefined): Promise<ClientSheetReadResult> {
    const fileReason = this.fileReason(file);
    if (fileReason) return { ok: false, reason: fileReason };
    if (!file) return { ok: false, reason: ClientImportFileReason.MISSING };

    const parsed = await this.parse(file.buffer);
    if (!parsed.ok) return parsed;

    return { ok: true, ...this.validate(parsed.cells) };
  }

  private fileReason(file: ClientImportUpload | undefined): ClientImportFileReason | null {
    if (!file || file.size === 0) return ClientImportFileReason.MISSING;
    if (file.size > CLIENT_IMPORT_MAX_BYTES) return ClientImportFileReason.TOO_LARGE;
    if (!XlsxService.isXlsx(file)) return ClientImportFileReason.UNSUPPORTED_TYPE;
    return null;
  }

  private async parse(
    buffer: Buffer,
  ): Promise<{ ok: true; cells: SheetCells[] } | Extract<ClientSheetReadResult, { ok: false }>> {
    const grid = await XlsxService.read(buffer);
    if (!grid) return { ok: false, reason: ClientImportFileReason.CORRUPT };

    const columns = this.mapHeaderColumns(grid.row(1));
    const missingColumns = REQUIRED_COLUMNS.filter((key) => columns[key] == null);
    if (missingColumns.length > 0) {
      return { ok: false, reason: ClientImportFileReason.MISSING_COLUMNS, missingColumns };
    }

    const cells: SheetCells[] = [];
    for (let rowNumber = 2; rowNumber <= grid.rowCount; rowNumber += 1) {
      const row = this.readRow(grid.row(rowNumber), columns);
      if (CLIENT_SHEET_COLUMNS.every((key) => row[key] === '')) continue;
      cells.push(row);
      if (cells.length > CLIENT_IMPORT_MAX_ROWS) {
        return { ok: false, reason: ClientImportFileReason.TOO_MANY_ROWS };
      }
    }

    if (cells.length === 0) return { ok: false, reason: ClientImportFileReason.EMPTY };
    return { ok: true, cells };
  }

  private validate(rawRows: SheetCells[]): { rows: ClientImportRow[]; invalidCount: number; duplicateCount: number } {
    const byPhone = new Map<string, ClientImportRow>();
    let invalidCount = 0;
    let duplicateCount = 0;

    for (const raw of rawRows) {
      const row = this.toImportRow(raw);
      if (!row) {
        invalidCount += 1;
        continue;
      }
      const current = byPhone.get(row.phone);
      if (!current) {
        byPhone.set(row.phone, row);
        continue;
      }
      duplicateCount += 1;
      byPhone.set(row.phone, this.mergeSameClient(current, row));
    }

    return { rows: [...byPhone.values()], invalidCount, duplicateCount };
  }

  private mergeSameClient(current: ClientImportRow, next: ClientImportRow): ClientImportRow {
    return {
      firstName: current.firstName,
      lastName: current.lastName,
      phone: current.phone,
      email: current.email ?? next.email,
      birthDate: current.birthDate ?? next.birthDate,
      gender: current.gender ?? next.gender,
      notes: current.notes ?? next.notes,
    };
  }

  private toImportRow(raw: SheetCells): ClientImportRow | null {
    const firstName = raw[ClientSheetColumn.FIRST_NAME];
    const lastName = raw[ClientSheetColumn.LAST_NAME];
    const phone = canonicalPhone(raw[ClientSheetColumn.PHONE]);

    if (!firstName || !lastName || !phone) return null;
    if (firstName.length > NAME_MAX || lastName.length > NAME_MAX) return null;
    if (!regularExpressions.phone.test(phone)) return null;

    const email = raw[ClientSheetColumn.EMAIL] || null;
    if (email && (email.length > EMAIL_MAX || !isEmail(email))) return null;

    const birthDate = this.parseBirthDate(raw[ClientSheetColumn.BIRTH_DATE]);
    if (birthDate === undefined) return null;

    const gender = this.normalizeGender(raw[ClientSheetColumn.GENDER]);
    if (gender === undefined) return null;

    const notes = raw[ClientSheetColumn.NOTES] || null;
    if (notes && notes.length > NOTES_MAX) return null;

    return { firstName, lastName, phone, email, birthDate, gender, notes };
  }

  private mapHeaderColumns(headerRow: XlsxCells): Partial<Record<ClientSheetColumn, number>> {
    const aliases = new Map<string, ClientSheetColumn>();
    for (const key of CLIENT_SHEET_COLUMNS) {
      for (const alias of HEADER_ALIASES[key]) aliases.set(this.normalizeHeader(alias), key);
    }

    const columns: Partial<Record<ClientSheetColumn, number>> = {};
    headerRow.each((text, column) => {
      const key = aliases.get(this.normalizeHeader(text));
      if (key && columns[key] == null) columns[key] = column;
    });
    return columns;
  }

  private readRow(row: XlsxCells, columns: Partial<Record<ClientSheetColumn, number>>): SheetCells {
    const cells = {} as SheetCells;
    for (const key of CLIENT_SHEET_COLUMNS) {
      const col = columns[key];
      cells[key] = col == null ? '' : row.text(col);
    }
    return cells;
  }

  private normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private parseBirthDate(value: string): string | null | undefined {
    if (!value) return null;
    const parsed = value.includes('.')
      ? parse(value, 'dd.MM.yyyy', new Date())
      : parse(value, 'yyyy-MM-dd', new Date());
    if (!isValid(parsed) || parsed.getFullYear() < BIRTH_YEAR_MIN) return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed > today) return undefined;
    return format(parsed, 'yyyy-MM-dd');
  }

  private normalizeGender(value: string): string | null | undefined {
    if (!value) return null;
    const mapped = GENDER_TO_CODE[value.toLowerCase()];
    if (mapped) return mapped;
    if (value.length > GENDER_MAX) return undefined;
    return value;
  }
}
