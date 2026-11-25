import { PassThrough } from 'stream';
import { XlsxBook } from '../../../shared/xlsx/interfaces/xlsx-book.interface.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { ServicePriceImportFileReason } from '../enums/service-price-import-file-reason.enum.js';
import { ServicePriceImportSheet } from '../enums/service-price-import-sheet.enum.js';
import { ServicePriceImportUpload } from '../interfaces/service-price-import-upload.interface.js';
import { ServicePriceSheetService } from './service-price-sheet.service.js';

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function upload(
  build: (book: XlsxBook) => void,
): Promise<ServicePriceImportUpload> {
  const buffer = await collect(XlsxUtils.write('prices.xlsx', build).stream);
  return {
    buffer,
    size: buffer.length,
    originalname: 'prices.xlsx',
    mimetype: XlsxUtils.mimeType,
  };
}


describe('ServicePriceSheetService', () => {
  const service = new ServicePriceSheetService();

  it('reads both sheets by name, with synonyms of the headers and level columns', async () => {
    const file = await upload((book) => {
      const prices = book.addSheet('Ещё лист');
      prices.addRow(['мусор']);
      const main = book.addSheet(' цены ');
      main.addRow([
        'Ид',
        'Название услуги',
        'Цена',
        'Длительность',
        'Цена: Топ',
        'Лишняя',
      ]);
      main.addRow(['abc', 'Укладка', 55.5, 30, '', 'x']);
      main.addRow([]);
      main.addRow(['', 'Новая', '1 200', 45, 70, '']);
      const staff = book.addSheet('Личные цены');
      staff.addRow(['staff id', 'service id', 'Цена', 'Мастер']);
      staff.addRow(['s1', 'a1', 9, 'Анна']);
      staff.addRow(['', '', '', 'Только имя']);
    });

    const result = await service.read(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { prices, staff } = result.book;
    expect(prices.rows.map((row) => row.row)).toEqual([2, 4]);
    expect(prices.rows[0]).toMatchObject({
      id: 'abc',
      title: 'Укладка',
      price: '55.5',
      duration: '30',
    });
    expect(prices.levelColumns.map((column) => column.header)).toEqual([
      'Цена: Топ',
      'Лишняя',
    ]);
    expect(prices.levelColumns[0]).toMatchObject({ name: 'Топ', prefixed: true });
    expect(prices.levelColumns[1].prefixed).toBe(false);
    expect(prices.rows[1].levels).toEqual(['70', '']);
    expect(staff?.rows).toEqual([
      { row: 2, serviceId: 'a1', staffId: 's1', price: '9' },
    ]);
  });

  it('falls back to the first sheet and treats the personal sheet as optional', async () => {
    const file = await upload((book) => {
      const first = book.addSheet('Прайс');
      first.addRow(['ID', 'Название', 'Базовая цена']);
      first.addRow(['x', '', 5]);
    });
    const result = await service.read(file);
    expect(result.ok && result.book.staff).toBeNull();
    expect(result.ok && result.book.prices.rows).toHaveLength(1);
  });

  it('names the missing columns of each sheet', async () => {
    const prices = await upload((book) => {
      book.addSheet('Цены').addRow(['ID', 'Название']);
    });
    expect(await service.read(prices)).toEqual({
      ok: false,
      reason: ServicePriceImportFileReason.MISSING_COLUMNS,
      sheet: ServicePriceImportSheet.PRICES,
      columns: ['Базовая цена'],
    });

    const staff = await upload((book) => {
      const main = book.addSheet('Цены');
      main.addRow(['ID', 'Название', 'Базовая цена']);
      main.addRow(['x', '', 5]);
      book.addSheet('Личные цены').addRow(['ID услуги', 'Мастер']);
    });
    expect(await service.read(staff)).toEqual({
      ok: false,
      reason: ServicePriceImportFileReason.MISSING_COLUMNS,
      sheet: ServicePriceImportSheet.STAFF_PRICES,
      columns: ['ID мастера', 'Цена'],
    });
  });

  it('rejects an empty file, a foreign type, garbage and a missing file', async () => {
    const empty = await upload((book) => {
      book.addSheet('Цены').addRow(['ID', 'Название', 'Базовая цена']);
    });
    expect(await service.read(empty)).toMatchObject({
      reason: ServicePriceImportFileReason.EMPTY,
    });
    expect(
      await service.read({ ...empty, originalname: 'prices.csv' }),
    ).toMatchObject({ reason: ServicePriceImportFileReason.UNSUPPORTED_TYPE });
    expect(
      await service.read({
        ...empty,
        buffer: Buffer.from('not a workbook'),
        size: 14,
      }),
    ).toMatchObject({ reason: ServicePriceImportFileReason.CORRUPT });
    expect(await service.read(undefined)).toMatchObject({
      reason: ServicePriceImportFileReason.MISSING,
    });
  });

  it('rejects more rows than the limit on a sheet', async () => {
    const file = await upload((book) => {
      const main = book.addSheet('Цены');
      main.addRow(['ID', 'Название', 'Базовая цена']);
      for (let i = 0; i < 2001; i += 1) main.addRow(['id', '', 1]);
    });
    expect(await service.read(file)).toEqual({
      ok: false,
      reason: ServicePriceImportFileReason.TOO_MANY_ROWS,
      sheet: ServicePriceImportSheet.PRICES,
    });
  });
});
