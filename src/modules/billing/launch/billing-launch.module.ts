import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configuration from '../../../config/configuration.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { AccessModule } from '../../access/access.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { BrandModule } from '../../brand/brand.module.js';
import { LocationModule } from '../../location/location.module.js';
import { BillingCoreModule } from '../billing-core.module.js';
import { BillingLaunchService } from './services/billing-launch.service.js';

/**
 * Context of the launch script only (plan section 13): no HTTP, no crons, no queues.
 * The app itself never launches billing.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      cache: true,
    }),
    EventEmitterModule.forRoot({ wildcard: true }),
    DatabaseModule,
    // Global in the app; BrandService needs its TokenEpochRegistryService.
    AuthModule,
    BillingCoreModule,
    BrandModule,
    AccessModule,
    LocationModule,
  ],
  providers: [BillingLaunchService],
})
export class BillingLaunchModule {}
