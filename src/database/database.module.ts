import { Global, Module } from '@nestjs/common';
import { DatabaseMetrics } from './database.metrics.js';
import { DatabaseService } from './database.service.js';

@Global()
@Module({
  providers: [DatabaseService, DatabaseMetrics],
  exports: [DatabaseService],
})
export class DatabaseModule {}
