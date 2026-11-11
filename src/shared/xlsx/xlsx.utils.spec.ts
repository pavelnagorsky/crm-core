import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PassThrough } from 'stream';
import { XlsxBook } from './interfaces/xlsx-book.interface.js';
import { XlsxFile } from './interfaces/xlsx-file.interface.js';
import { XlsxUtils } from './xlsx.utils.js';

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function sheetNames(build: (book: XlsxBook) => void): Promise<string[]> {
  const file = XlsxUtils.write('book.xlsx', build);
  const workbook = await loadWorkbook(file);
  return workbook.worksheets.map((sheet) => sheet.name);
}

async function loadWorkbook(file: XlsxFile): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await collect(file.stream)) as unknown as Parameters<
      ExcelJS.Xlsx['load']
    >[0],
  );
  return workbook;
}

describe('XlsxUtils', () => {
  it('writes a dated table and reads the cells back as text', async () => {
    const file = XlsxUtils.table(
      [{ name: '  Anna  ', phone: 375 }],
      [
        { header: 'Имя', key: 'name' },
        { header: 'Телефон', key: 'phone', width: 18 },
      ],
      'clients',
      'Клиенты',
    );

    expect(file.filename).toMatch(/^clients-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const grid = await XlsxUtils.read(await collect(file.stream));
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.rowCount).toBe(2);
    expect(grid.row(1).text(1)).toBe('Имя');
    expect(grid.row(1).text(2)).toBe('Телефон');
    expect(grid.row(2).text(1)).toBe('Anna');
    expect(grid.row(2).text(2)).toBe('375');
  });

  it('expands table columns to fit headers and row content', async () => {
    const file = XlsxUtils.table(
      [
        {
          name: 'Long client name that should fit',
          phone: '+375291234567 extra digits',
        },
      ],
      [
        { header: 'Name', key: 'name' },
        { header: 'Phone', key: 'phone', width: 18 },
      ],
      'clients',
    );

    const workbook = await loadWorkbook(file);
    const sheet = workbook.worksheets[0];

    expect(sheet.getColumn(1).width).toBeGreaterThanOrEqual(34);
    expect(sheet.getColumn(2).width).toBeGreaterThanOrEqual(27);
  });

  it('expands columns for report-style sheets without setColumns', async () => {
    const file = XlsxUtils.write('report.xlsx', (book) => {
      const sheet = book.addSheet('Report');
      sheet.addRow(['Period', '2026-10-01 - 2026-10-31']);
      sheet.addRow([]);
      sheet.addRow([
        'Total amount payable for every active staff member',
        '1234567.89',
      ]);
    });

    const workbook = await loadWorkbook(file);
    const sheet = workbook.worksheets[0];

    expect(sheet.getColumn(1).width).toBeGreaterThanOrEqual(50);
    expect(sheet.getColumn(2).width).toBeGreaterThanOrEqual(25);
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
    sheet.getCell('B1').value = {
      richText: [{ text: 'Hello ' }, { text: 'world' }],
    };
    sheet.getCell('C1').value = { formula: '1+1', result: 2 };
    sheet.getCell('D1').value = {
      text: ' site ',
      hyperlink: 'https://example.com',
    };

    const grid = await XlsxUtils.read(
      Buffer.from(await book.xlsx.writeBuffer()),
    );
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.row(1).text(1)).toBe('1990-02-01');
    expect(grid.row(1).text(2)).toBe('Hello world');
    expect(grid.row(1).text(3)).toBe('2');
    expect(grid.row(1).text(4)).toBe('site');
  });

  it('returns null for a corrupt buffer or a workbook with no sheets', async () => {
    await expect(
      XlsxUtils.read(Buffer.from('not-a-workbook')),
    ).resolves.toBeNull();
    const empty = Buffer.from(await new ExcelJS.Workbook().xlsx.writeBuffer());
    await expect(XlsxUtils.read(empty)).resolves.toBeNull();
  });

  it('streams rows of the first sheet with typed values', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reviews');
    sheet.getCell('A1').value = 'Дата';
    sheet.getCell('B1').value = 'Оценка';
    sheet.getCell('A2').value = new Date(Date.UTC(2024, 2, 31, 23, 30));
    sheet.getCell('A2').numFmt = 'dd.mm.yyyy hh:mm';
    sheet.getCell('B2').value = 5;
    sheet.getCell('A4').value = { richText: [{ text: ' 01.02.2024 ' }] };
    sheet.getCell('B4').value = { formula: '2+2', result: 4 };
    workbook.addWorksheet('Other').getCell('A1').value = 'ignored';
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const rows = [];
    for await (const row of XlsxUtils.rows(buffer)) {
      rows.push({
        number: row.number,
        first: row.value(1),
        second: row.value(2),
        text: row.text(2),
      });
    }

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      number: 1,
      first: 'Дата',
      second: 'Оценка',
      text: 'Оценка',
    });
    expect(rows[1].number).toBe(2);
    expect((rows[1].first as Date).toISOString()).toBe(
      '2024-03-31T23:30:00.000Z',
    );
    expect(rows[1].second).toBe(5);
    expect(rows[2]).toEqual({
      number: 4,
      first: '01.02.2024',
      second: 4,
      text: '4',
    });
  });

  it('streams a workbook that has no shared strings part', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Numbers').addRow([1, 2]);
    const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
    zip.remove('xl/sharedStrings.xml');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const values = [];
    for await (const row of XlsxUtils.rows(buffer))
      values.push([row.value(1), row.value(2)]);

    expect(values).toEqual([[1, 2]]);
  });

  it('throws while streaming a corrupt buffer', async () => {
    const read = async () => {
      for await (const row of XlsxUtils.rows(Buffer.from('not-a-workbook')))
        void row;
    };
    await expect(read()).rejects.toThrow();
  });

  it('accepts an xlsx upload and rejects other files', () => {
    expect(
      XlsxUtils.isXlsx({
        originalname: 'Clients.XLSX',
        mimetype: XlsxUtils.mimeType,
      }),
    ).toBe(true);
    expect(
      XlsxUtils.isXlsx({
        originalname: 'clients.xlsx',
        mimetype: 'application/octet-stream',
      }),
    ).toBe(true);
    expect(
      XlsxUtils.isXlsx({ originalname: 'clients.csv', mimetype: 'text/csv' }),
    ).toBe(false);
  });
});
