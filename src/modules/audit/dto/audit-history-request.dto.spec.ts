import { ValidationPipe } from '@nestjs/common';
import { AuditHistoryRequestDto } from './audit-history-request.dto.js';

describe('Audit history filters', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  it('allows reading the full scoped history without an entity filter', async () => {
    await expect(
      pipe.transform({}, { type: 'query', metatype: AuditHistoryRequestDto }),
    ).resolves.toBeInstanceOf(AuditHistoryRequestDto);
  });
  it('accepts the access history filter and rejects unknown entity types', async () => {
    await expect(
      pipe.transform(
        { entityType: 'ACCESS' },
        { type: 'query', metatype: AuditHistoryRequestDto },
      ),
    ).resolves.toMatchObject({ entityType: 'ACCESS' });
    await expect(
      pipe.transform(
        { entityType: 'INVALID' },
        { type: 'query', metatype: AuditHistoryRequestDto },
      ),
    ).rejects.toThrow();
  });
});
