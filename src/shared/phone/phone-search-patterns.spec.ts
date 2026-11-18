import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClientSearchRequestDto } from '../../modules/clients/dto/client-search-request.dto.js';
import { phoneSearchPatterns } from './phone-search-patterns.js';

describe('phoneSearchPatterns', () => {
  it('matches typed digits anywhere and ranks numbers that start with them', () => {
    expect(phoneSearchPatterns('29233')).toEqual({
      contains: '29233',
      trunkPrefixes: [],
      rankPrefixes: ['+29233', '+37529233', '+729233'],
    });
  });

  it('reads a leading 80 as the Belarus trunk prefix', () => {
    expect(phoneSearchPatterns('8029233')).toEqual({
      contains: '8029233',
      trunkPrefixes: ['+37529233'],
      rankPrefixes: ['+8029233', '+37529233', '+3758029233', '+78029233'],
    });
  });

  it('reads another leading 8 as the Russia trunk prefix and 00 as international', () => {
    expect(phoneSearchPatterns('8916123').trunkPrefixes).toEqual(['+7916123']);
    expect(phoneSearchPatterns('00375291').trunkPrefixes).toEqual(['+375291']);
  });

  it('keeps a full international number as its own prefix', () => {
    const patterns = phoneSearchPatterns('375292332000');
    expect(patterns.contains).toBe('375292332000');
    expect(patterns.rankPrefixes[0]).toBe('+375292332000');
  });
});

describe('ClientSearchRequestDto phone', () => {
  const parse = (phone: string) =>
    plainToInstance(ClientSearchRequestDto, { phone });

  it.each([
    ['+375 (29) 233-20', '3752923320'],
    ['29 233', '29233'],
    ['8 029 233', '8029233'],
  ])('reduces %s to digits', async (typed, digits) => {
    const dto = parse(typed);
    expect(dto.phone).toBe(digits);
    expect(await validate(dto)).toEqual([]);
  });

  it.each(['29', '+3 ', 'анна'])(
    'rejects %s with fewer than 3 digits',
    async (typed) => {
      expect(await validate(parse(typed))).toHaveLength(1);
    },
  );
});
