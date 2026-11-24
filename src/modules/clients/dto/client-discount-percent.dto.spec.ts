import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClientDto } from './create-client.dto.js';
import { UpdateClientDto } from './update-client.dto.js';

const base = { firstName: 'Анна', lastName: 'Иванова', phone: '+375291234567' };

async function errors(
  type: typeof CreateClientDto | typeof UpdateClientDto,
  discountPercent: unknown,
) {
  const dto = plainToInstance(type, { ...base, discountPercent });
  const found = await validate(dto, { whitelist: true });
  return { dto, properties: found.map((error) => error.property) };
}

describe('Client personal discount (docs/pricing-stage4-api.md)', () => {
  describe.each([CreateClientDto, UpdateClientDto])('%o', (type) => {
    it.each([
      ['10', '10.00'],
      ['0.01', '0.01'],
      ['100', '100.00'],
      ['12.5', '12.50'],
    ])('accepts %s as %s', async (value, canonical) => {
      const { dto, properties } = await errors(type, value);
      expect(properties).toEqual([]);
      expect(dto.discountPercent).toBe(canonical);
    });

    it.each([null, undefined])('accepts %s (none or keep)', async (value) => {
      expect((await errors(type, value)).properties).toEqual([]);
    });

    it.each(['0', '0.00', '100.01', '-5', '10.123', 'abc'])(
      'rejects %s',
      async (value) => {
        expect((await errors(type, value)).properties).toEqual([
          'discountPercent',
        ]);
      },
    );
  });
});
