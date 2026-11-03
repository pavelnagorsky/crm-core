import { Test } from '@nestjs/testing';
import { AppModule } from '../../app.module.js';
import { DatabaseService } from '../../database/database.service.js';
import { AccessService } from '../access/services/access.service.js';
import { AuditService } from './services/audit.service.js';

describe('Audit module dependencies', () => {
  it('resolves access and audit providers in the application without connecting to a database', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({})
      .compile();
    try {
      expect(module.get(AccessService)).toBeInstanceOf(AccessService);
      expect(module.get(AuditService)).toBeInstanceOf(AuditService);
    } finally {
      await module.close();
    }
  });
});
