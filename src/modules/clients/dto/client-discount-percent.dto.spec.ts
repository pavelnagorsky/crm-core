import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClientDto } from './create-client.dto.js';
import { UpdateClientDto } from './update-client.dto.js';

const base = { firstName: 'Анна', lastName: 'Иванова', phone: '+375291234567' };

async function errors(
  type: typeof CreateClientDto | typeof UpdateClientDto,
  field: 'servicesDiscountPercent' | 'productsDiscountPercent',
  value: unknown,
) {
  const dto = plainToInstance(type, { ...base, [field]: value });
  const found = await validate(dto, { whitelist: true });
  return { dto, properties: found.map((error) => error.property) };
}

describe('Client personal discounts (docs/pricing-stage7-api.md)', () => {
  describe.each([
    [CreateClientDto, 'servicesDiscountPercent'],
    [CreateClientDto, 'productsDiscountPercent'],
    [UpdateClientDto, 'servicesDiscountPercent'],
    [UpdateClientDto, 'productsDiscountPercent'],
  ] as const)('%o %s', (type, field) => {
    it.each([
      ['10', '10.00'],
      ['0.01', '0.01'],
      ['100', '100.00'],
      ['12.5', '12.50'],
    ])('accepts %s as %s', async (value, canonical) => {
      const { dto, properties } = await errors(type, field, value);
      expect(properties).toEqual([]);
      expect(dto[field]).toBe(canonical);
    });

    it.each([null, undefined])('accepts %s (none or keep)', async (value) => {
      expect((await errors(type, field, value)).properties).toEqual([]);
    });

    it.each(['0', '0.00', '100.01', '-5', '10.123', 'abc'])(
      'rejects %s',
      async (value) => {
        expect((await errors(type, field, value)).properties).toEqual([field]);
      },
    );
  });
});
