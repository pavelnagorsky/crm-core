import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFeedbackDto } from './create-feedback.dto.js';
import { FeedbackSearchRequestDto } from './feedback-search-request.dto.js';
import { UpdateFeedbackDto } from './update-feedback.dto.js';

describe('Feedback validation', () => {
  it.each([
    { phone: '+375 29 000-00-00', email: '' },
    { phone: '', email: ' Client@Example.com ' },
    { phone: null, email: 'client@example.com' },
  ])(
    'accepts a single contact and nullable company/message: %j',
    async (contact) => {
      const dto = plainToInstance(CreateFeedbackDto, {
        name: ' Pavel ',
        company: null,
        message: null,
        ...contact,
      });
      expect(await validate(dto)).toEqual([]);
      expect(dto.name).toBe('Pavel');
      if (contact.phone) expect(dto.phone).toBe('+375290000000');
      if (contact.email) expect(dto.email).toBe('client@example.com');
    },
  );

  it.each([
    { name: ' ' },
    { name: null },
    { name: 'a'.repeat(101) },
    { phone: 'wrong' },
    { email: 'wrong' },
    { company: 123 },
    { message: 'a'.repeat(5001) },
  ])('rejects invalid form fields: %j', async (overrides) => {
    const dto = plainToInstance(CreateFeedbackDto, {
      name: 'Pavel',
      email: 'a@example.com',
      ...overrides,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('strips attempts to set admin-only fields through the public form', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform(
      {
        name: 'Pavel',
        email: 'a@example.com',
        status: 'DONE',
        notes: 'injected',
      },
      {
        type: 'body',
        metatype: CreateFeedbackDto,
      },
    );
    expect(dto).not.toHaveProperty('status');
    expect(dto).not.toHaveProperty('notes');
  });

  it('allows clearing notes but rejects null or unknown statuses', async () => {
    expect(
      await validate(plainToInstance(UpdateFeedbackDto, { notes: null })),
    ).toEqual([]);
    for (const status of [null, 'UNKNOWN']) {
      expect(
        (await validate(plainToInstance(UpdateFeedbackDto, { status }))).length,
      ).toBeGreaterThan(0);
    }
  });

  it('rejects arbitrary sorting fields and invalid pagination', async () => {
    const dto = plainToInstance(FeedbackSearchRequestDto, {
      orderBy: 'notes',
      page: 0,
      pageSize: -1,
      status: 'UNKNOWN',
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['orderBy', 'page', 'pageSize', 'status']),
    );
  });
});
