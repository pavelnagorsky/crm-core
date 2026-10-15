import { ValidationPipe } from '@nestjs/common';
import { BusinessType } from '@prisma/client';
import { CreateBrandDto } from '../../brand/dto/create-brand.dto.js';
import { CreateLocationDto } from './create-location.dto.js';
import { UpdateLocationDto } from './update-location.dto.js';

describe('Location request contracts', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  it('accepts all advertised types both at creation and editing', async () => {
    for (const businessType of Object.values(BusinessType)) {
      await expect(
        pipe.transform(
          {
            name: 'Location',
            countryCode: 'BY',
            currency: 'BYN',
            timezone: 'Europe/Minsk',
            businessType,
          },
          { type: 'body', metatype: CreateLocationDto },
        ),
      ).resolves.toMatchObject({ businessType });
      await expect(
        pipe.transform(
          { businessType },
          { type: 'body', metatype: UpdateLocationDto },
        ),
      ).resolves.toMatchObject({ businessType });
    }
  });

  it('allows clearing the type and rejects unknown types on editing', async () => {
    await expect(
      pipe.transform(
        { businessType: null },
        { type: 'body', metatype: UpdateLocationDto },
      ),
    ).resolves.toMatchObject({ businessType: null });
    await expect(
      pipe.transform(
        { businessType: 'UNKNOWN' },
        { type: 'body', metatype: UpdateLocationDto },
      ),
    ).rejects.toThrow();
  });

  it.each([undefined, null, []])(
    'requires a first location object: %j',
    async (location) => {
      await expect(
        pipe.transform(
          { name: 'Brand', location },
          { type: 'body', metatype: CreateBrandDto },
        ),
      ).rejects.toThrow();
    },
  );
});
