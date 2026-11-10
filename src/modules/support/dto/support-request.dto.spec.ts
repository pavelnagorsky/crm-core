import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSupportRequestDto } from './create-support-request.dto.js';
import { SupportRequestSearchRequestDto } from './support-request-search-request.dto.js';
import { UpdateSupportRequestDto } from './update-support-request.dto.js';

const FILE_ID = '11111111-1111-4111-8111-111111111111';

describe('Support request validation', () => {
  it('normalizes email and trims the message', async () => {
    const dto = plainToInstance(CreateSupportRequestDto, {
      email: ' User@Example.COM ',
      message: '  Help me  ',
      fileIds: [FILE_ID],
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.email).toBe('user@example.com');
    expect(dto.message).toBe('Help me');
  });

  it.each([null, '', '   ', undefined])(
    'treats empty email as absent: %j',
    async (email) => {
      const dto = plainToInstance(CreateSupportRequestDto, {
        email,
        message: 'Help',
      });
      expect(await validate(dto)).toEqual([]);
      expect(dto.email ?? null).toBeNull();
    },
  );

  it('accepts a message of exactly 5000 characters after trimming', async () => {
    const dto = plainToInstance(CreateSupportRequestDto, {
      message: ` ${'a'.repeat(5000)} `,
    });
    expect(await validate(dto)).toEqual([]);
  });

  it.each([
    { message: '   ' },
    { message: null },
    { message: 'a'.repeat(5001) },
    { email: 'wrong' },
    { email: `${'a'.repeat(250)}@example.com` },
    { fileIds: 'not-an-array' },
    { fileIds: ['not-a-uuid'] },
    { fileIds: [FILE_ID, FILE_ID] },
    {
      fileIds: Array.from(
        { length: 11 },
        (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      ),
    },
  ])('rejects invalid fields: %j', async (overrides) => {
    const dto = plainToInstance(CreateSupportRequestDto, {
      message: 'Help',
      ...overrides,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('strips admin-only fields from the public form', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform(
      {
        message: 'Help',
        status: 'RESOLVED',
        notes: 'injected',
        userId: 'someone',
      },
      { type: 'body', metatype: CreateSupportRequestDto },
    );
    expect(dto).not.toHaveProperty('status');
    expect(dto).not.toHaveProperty('notes');
    expect(dto).not.toHaveProperty('userId');
  });

  it('allows clearing notes but rejects null or unknown statuses', async () => {
    expect(
      await validate(plainToInstance(UpdateSupportRequestDto, { notes: null })),
    ).toEqual([]);
    for (const status of [null, 'UNKNOWN']) {
      expect(
        (await validate(plainToInstance(UpdateSupportRequestDto, { status })))
          .length,
      ).toBeGreaterThan(0);
    }
  });

  it('rejects arbitrary sorting fields and unknown statuses in search', async () => {
    const dto = plainToInstance(SupportRequestSearchRequestDto, {
      orderBy: 'notes',
      status: 'UNKNOWN',
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['orderBy', 'status']),
    );
  });
});
