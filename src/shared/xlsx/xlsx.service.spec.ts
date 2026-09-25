import { PassThrough } from 'stream';
import ExcelJS from 'exceljs';
import { XlsxBook } from './interfaces/xlsx-book.interface.js';
import { XlsxService } from './xlsx.service.js';

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function sheetNames(build: (book: XlsxBook) => void): Promise<string[]> {
  const file = XlsxService.write('book.xlsx', build);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await collect(file.stream)) as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  return workbook.worksheets.map((sheet) => sheet.name);
}

describe('XlsxService', () => {
  it('writes a dated table and reads the cells back as text', async () => {
    const file = XlsxService.table(
      [{ name: '  Anna  ', phone: 375 }],
      [
        { header: 'Имя', key: 'name' },
        { header: 'Телефон', key: 'phone', width: 18 },
      ],
      'clients',
      'Клиенты',
    );

    expect(file.filename).toMatch(/^clients-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const grid = await XlsxService.read(await collect(file.stream));
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.rowCount).toBe(2);
    expect(grid.row(1).text(1)).toBe('Имя');
    expect(grid.row(1).text(2)).toBe('Телефон');
    expect(grid.row(2).text(1)).toBe('Anna');
    expect(grid.row(2).text(2)).toBe('375');
  });

  it('sanitizes worksheet names', async () => {
    await expect(
      sheetNames((book) => {
        book.addSheet('Анна / колорист', 'сотрудник').addRow(['x']);
      }),
    ).resolves.toEqual(['Анна   колорист']);
    await expect(
      sheetNames((book) => {
        book.addSheet('', 'сотрудник').addRow(['x']);
      }),
    ).resolves.toEqual(['сотрудник']);
    const [name] = await sheetNames((book) => {
      book.addSheet('x'.repeat(40), 'сотрудник').addRow(['x']);
    });
    expect(name).toHaveLength(31);
  });

  it('reads dates, rich text, and formula results', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Клиенты');
    sheet.getCell('A1').value = new Date(1990, 1, 1);
    sheet.getCell('B1').value = { richText: [{ text: 'Hello ' }, { text: 'world' }] };
    sheet.getCell('C1').value = { formula: '1+1', result: 2 };
    sheet.getCell('D1').value = { text: ' site ', hyperlink: 'https://example.com' };

    const grid = await XlsxService.read(Buffer.from(await book.xlsx.writeBuffer()));
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.row(1).text(1)).toBe('1990-02-01');
    expect(grid.row(1).text(2)).toBe('Hello world');
    expect(grid.row(1).text(3)).toBe('2');
    expect(grid.row(1).text(4)).toBe('site');
  });

  it('returns null for a corrupt buffer or a workbook with no sheets', async () => {
    await expect(XlsxService.read(Buffer.from('not-a-workbook'))).resolves.toBeNull();
    const empty = Buffer.from(await new ExcelJS.Workbook().xlsx.writeBuffer());
    await expect(XlsxService.read(empty)).resolves.toBeNull();
  });

  it('accepts an xlsx upload and rejects other files', () => {
    expect(
      XlsxService.isXlsx({
        originalname: 'Clients.XLSX',
        mimetype: XlsxService.mimeType,
      }),
    ).toBe(true);
    expect(
      XlsxService.isXlsx({
        originalname: 'clients.xlsx',
        mimetype: 'application/octet-stream',
      }),
    ).toBe(true);
    expect(XlsxService.isXlsx({ originalname: 'clients.csv', mimetype: 'text/csv' })).toBe(false);
  });
});
