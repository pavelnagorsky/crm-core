import { PassThrough } from 'stream';
import { Client } from '@prisma/client';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { LocaleService } from '../../../shared/i18n/locale.service.js';
import { XlsxService } from '../../../shared/xlsx/xlsx.service.js';
import { ClientsService } from '../clients.service.js';
import { ClientSearchOrderBy } from '../enums/client-search-order-by.enum.js';
import { ClientsExportService } from './clients-export.service.js';

const labels = {
  sheet: 'Клиенты',
  firstName: 'Имя',
  lastName: 'Фамилия',
  phone: 'Телефон',
  email: 'Email',
  birthDate: 'Дата рождения',
  gender: 'Пол',
  notes: 'Заметки',
  genderMale: 'Мужской',
  genderFemale: 'Женский',
};

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    brandId: 'business-1',
    userId: null,
    firstName: 'Анна',
    lastName: 'Иванова',
    phone: '+375291112233',
    email: 'anna@example.com',
    birthDate: new Date('1990-02-01T00:00:00.000Z'),
    gender: 'FEMALE',
    notes: 'постоянный клиент',
    bannedAt: null,
    banReason: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ClientsExportService', () => {
  const clients = {
    search: vi.fn<ClientsService['search']>(),
  };
  const locale = {
    get: vi.fn<LocaleService['get']>(),
  };
  const service = new ClientsExportService(
    clients as unknown as ClientsService,
    locale as unknown as LocaleService,
  );

  beforeEach(() => {
    clients.search.mockReset();
    locale.get.mockReset();
    locale.get.mockReturnValue({ documents: { clients: labels } } as ReturnType<
      LocaleService['get']
    >);
  });

  it('exports every client matching the table search and order as xlsx', async () => {
    clients.search.mockResolvedValue({
      items: [
        client(),
        client({
          id: 'client-2',
          gender: 'OTHER',
          email: null,
          birthDate: null,
          notes: null,
        }),
      ],
      totalItems: 2,
    });

    const file = await service.stream('business-1', {
      search: 'анна',
      orderBy: ClientSearchOrderBy.LAST_NAME,
      orderDirection: OrderDirection.ASC,
    });

    expect(clients.search).toHaveBeenCalledWith('business-1', {
      search: 'анна',
      orderBy: ClientSearchOrderBy.LAST_NAME,
      orderDirection: OrderDirection.ASC,
      page: 1,
      pageSize: 1,
      isExport: true,
    });
    expect(file.filename).toMatch(/^clients-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const grid = await XlsxService.read(await collect(file.stream));
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.rowCount).toBe(3);
    expect(grid.row(1).text(1)).toBe('Имя');
    expect(grid.row(1).text(6)).toBe('Пол');
    expect(grid.row(2).text(1)).toBe('Анна');
    expect(grid.row(2).text(3)).toBe('+375291112233');
    expect(grid.row(2).text(5)).toBe('1990-02-01');
    expect(grid.row(2).text(6)).toBe('Женский');
    expect(grid.row(2).text(7)).toBe('постоянный клиент');
    expect(grid.row(3).text(4)).toBe('');
    expect(grid.row(3).text(5)).toBe('');
    expect(grid.row(3).text(6)).toBe('OTHER');
    expect(grid.row(3).text(7)).toBe('');
  });
});
