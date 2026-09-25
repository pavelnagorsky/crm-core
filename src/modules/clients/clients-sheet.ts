import { format, isValid, parse } from 'date-fns';
import ExcelJS from 'exceljs';
import regularExpressions from '../../shared/regular-expressions.js';

export const CLIENT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const CLIENT_IMPORT_MAX_ROWS = 2000;

export const CLIENT_SHEET_KEYS = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'birthDate',
  'gender',
  'notes',
] as const;

export type ClientSheetKey = (typeof CLIENT_SHEET_KEYS)[number];

const REQUIRED_KEYS: ClientSheetKey[] = ['firstName', 'lastName', 'phone'];

const HEADER_ALIASES: Record<ClientSheetKey, string[]> = {
  firstName: ['имя', 'firstname', 'first name'],
  lastName: ['фамилия', 'lastname', 'last name'],
  phone: ['телефон', 'phone', 'тел'],
  email: ['email', 'e-mail', 'почта'],
  birthDate: ['дата рождения', 'birthdate', 'birth date', 'др'],
  gender: ['пол', 'gender'],
  notes: ['заметки', 'notes', 'примечание', 'комментарий'],
};

export type ClientImportFileReason =
  | 'MISSING'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'CORRUPT'
  | 'MISSING_COLUMNS'
  | 'EMPTY'
  | 'TOO_MANY_ROWS';

export type ClientSheetHeaders = Record<ClientSheetKey, string>;

export type RawClientRow = {
  row: number;
  cells: Record<ClientSheetKey, string>;
};

export type ParsedClientSheet =
  | { ok: true; rows: RawClientRow[] }
  | { ok: false; reason: ClientImportFileReason; missingColumns?: ClientSheetKey[] };

export type ClientRowFields = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  birthDate: string | null;
  gender: string | null;
  notes: string | null;
};

export type ClientRowErrorCode =
  | 'REQUIRED'
  | 'INVALID_PHONE'
  | 'INVALID_EMAIL'
  | 'INVALID_DATE'
  | 'TOO_LONG'
  | 'DUPLICATE_IN_FILE'
  | 'CLIENT_PHONE_EXISTS';

export type ValidatedClientRow =
  | { ok: true; row: number; fields: ClientRowFields }
  | { ok: false; row: number; code: ClientRowErrorCode; message: string };

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

export function clientSheetHeaders(labels: ClientSheetHeaders): ClientSheetHeaders {
  return labels;
}

export function assertImportFile(file: { size: number; originalname: string; mimetype: string } | undefined): ClientImportFileReason | null {
  if (!file || file.size === 0) return 'MISSING';
  if (file.size > CLIENT_IMPORT_MAX_BYTES) return 'TOO_LARGE';
  const name = file.originalname.toLowerCase();
  const mimeOk = file.mimetype === XLSX_MIME || file.mimetype === 'application/octet-stream';
  if (!name.endsWith('.xlsx') || !mimeOk) return 'UNSUPPORTED_TYPE';
  return null;
}

export async function parseClientSheet(buffer: Buffer, headers: ClientSheetHeaders): Promise<ParsedClientSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { ok: false, reason: 'CORRUPT' };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { ok: false, reason: 'CORRUPT' };

  const headerRow = sheet.getRow(1);
  const columns = mapHeaderColumns(headerRow, headers);
  const missingColumns = REQUIRED_KEYS.filter((key) => columns[key] == null);
  if (missingColumns.length > 0) return { ok: false, reason: 'MISSING_COLUMNS', missingColumns };

  const rows: RawClientRow[] = [];
  const lastRow = sheet.rowCount;
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const cells = readRow(sheet.getRow(rowNumber), columns);
    if (CLIENT_SHEET_KEYS.every((key) => cells[key] === '')) continue;
    rows.push({ row: rowNumber, cells });
    if (rows.length > CLIENT_IMPORT_MAX_ROWS) return { ok: false, reason: 'TOO_MANY_ROWS' };
  }

  if (rows.length === 0) return { ok: false, reason: 'EMPTY' };
  return { ok: true, rows };
}

export function validateClientRow(raw: RawClientRow, seenPhones: Set<string>): ValidatedClientRow {
  const firstName = raw.cells.firstName;
  const lastName = raw.cells.lastName;
  const phone = normalizeImportPhone(raw.cells.phone);

  if (!firstName || !lastName || !phone) {
    return { ok: false, row: raw.row, code: 'REQUIRED', message: 'Имя, фамилия и телефон обязательны' };
  }
  if (firstName.length > 100 || lastName.length > 100) {
    return { ok: false, row: raw.row, code: 'TOO_LONG', message: 'Имя и фамилия не длиннее 100 символов' };
  }
  if (!regularExpressions.phone.test(phone)) {
    return { ok: false, row: raw.row, code: 'INVALID_PHONE', message: 'Телефон должен быть в международном формате, например +375291112233' };
  }
  if (seenPhones.has(phone)) {
    return { ok: false, row: raw.row, code: 'DUPLICATE_IN_FILE', message: 'Этот телефон уже встречается в файле' };
  }

  const email = raw.cells.email || null;
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { ok: false, row: raw.row, code: 'INVALID_EMAIL', message: 'Некорректный email' };
  }

  const birthDate = parseBirthDate(raw.cells.birthDate);
  if (birthDate === 'invalid') {
    return { ok: false, row: raw.row, code: 'INVALID_DATE', message: 'Дата рождения должна быть в формате ГГГГ-ММ-ДД или ДД.ММ.ГГГГ' };
  }

  const gender = normalizeGender(raw.cells.gender);
  if (gender === 'invalid') {
    return { ok: false, row: raw.row, code: 'TOO_LONG', message: 'Пол не длиннее 20 символов' };
  }

  const notes = raw.cells.notes || null;
  if (notes && notes.length > 1000) {
    return { ok: false, row: raw.row, code: 'TOO_LONG', message: 'Заметки не длиннее 1000 символов' };
  }

  seenPhones.add(phone);
  return {
    ok: true,
    row: raw.row,
    fields: { firstName, lastName, phone, email, birthDate, gender, notes },
  };
}

export function genderLabel(code: string | null, headers: Pick<ClientSheetHeaders, 'genderMale' | 'genderFemale'>): string {
  if (code === 'MALE') return headers.genderMale;
  if (code === 'FEMALE') return headers.genderFemale;
  return code ?? '';
}

export function formatBirthDate(value: Date | null): string {
  if (!value) return '';
  return format(value, 'yyyy-MM-dd');
}

export async function buildClientWorkbook(
  headers: ClientSheetHeaders,
  rows: Record<ClientSheetKey, string>[],
  sheetName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = CLIENT_SHEET_KEYS.map((key) => ({
    header: headers[key],
    key,
    width: key === 'notes' ? 40 : 22,
  }));
  for (const row of rows) sheet.addRow(row);
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}

function mapHeaderColumns(headerRow: ExcelJS.Row, headers: ClientSheetHeaders): Partial<Record<ClientSheetKey, number>> {
  const aliases = new Map<string, ClientSheetKey>();
  for (const key of CLIENT_SHEET_KEYS) {
    aliases.set(normalizeHeader(headers[key]), key);
    for (const alias of HEADER_ALIASES[key]) aliases.set(normalizeHeader(alias), key);
  }

  const columns: Partial<Record<ClientSheetKey, number>> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = aliases.get(normalizeHeader(cellText(cell.value)));
    if (key && columns[key] == null) columns[key] = col;
  });
  return columns;
}

function readRow(row: ExcelJS.Row, columns: Partial<Record<ClientSheetKey, number>>): Record<ClientSheetKey, string> {
  const cells = {} as Record<ClientSheetKey, string>;
  for (const key of CLIENT_SHEET_KEYS) {
    const col = columns[key];
    cells[key] = col == null ? '' : cellText(row.getCell(col).value);
  }
  return cells;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return format(value, 'yyyy-MM-dd');
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('').trim();
    }
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('text' in value && value.text != null) return cellText(value.text as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeImportPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('80')) return `+375${digits.slice(2)}`;
  return `+${digits}`;
}

function parseBirthDate(value: string): string | null | 'invalid' {
  if (!value) return null;
  const parsed = value.includes('.')
    ? parse(value, 'dd.MM.yyyy', new Date())
    : parse(value, 'yyyy-MM-dd', new Date());
  if (!isValid(parsed) || parsed.getFullYear() < 1900) return 'invalid';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed > today) return 'invalid';
  return format(parsed, 'yyyy-MM-dd');
}

function normalizeGender(value: string): string | null | 'invalid' {
  if (!value) return null;
  const mapped = GENDER_TO_CODE[value.toLowerCase()];
  if (mapped) return mapped;
  if (value.length > 20) return 'invalid';
  return value;
}
