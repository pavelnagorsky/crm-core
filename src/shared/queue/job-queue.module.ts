import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobQueueMetrics } from './job-queue.metrics.js';
import { JobQueueService } from './job-queue.service.js';

@Module({
  imports: [ConfigModule],
  providers: [JobQueueService, JobQueueMetrics],
  exports: [JobQueueService],
})
export class JobQueueModule {}
