import { Module } from '@nestjs/common';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { LocationModule } from '../location/location.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { StaffCompensationController } from './compensation/controllers/staff-compensation.controller.js';
import { StaffCompensationService } from './compensation/services/staff-compensation.service.js';
import { EarningCalculator } from './earnings/calculators/earning.calculator.js';
import { StaffEarningsController } from './earnings/controllers/staff-earnings.controller.js';
import { ProductSaleEarningReversalService } from './earnings/services/product-sale-earning-reversal.service.js';
import { StaffEarningWriterService } from './earnings/services/staff-earning-writer.service.js';
import { StaffEarningsService } from './earnings/services/staff-earnings.service.js';
import { PayrollCalculator } from './periods/calculators/payroll.calculator.js';
import { PayrollPeriodsController } from './periods/controllers/payroll-periods.controller.js';
import { PayrollCalculationService } from './periods/services/payroll-calculation.service.js';
import { PayrollPeriodLockService } from './periods/services/payroll-period-lock.service.js';
import { PayrollPeriodService } from './periods/services/payroll-period.service.js';
import { PayrollReportService } from './report/services/payroll-report.service.js';

@Module({
  imports: [StaffModule, LocationModule, ServiceCatalogModule, I18nModule],
  controllers: [
    StaffCompensationController,
    StaffEarningsController,
    PayrollPeriodsController,
  ],
  providers: [
    PayrollCalculationService,
    PayrollPeriodLockService,
    EarningCalculator,
    StaffEarningWriterService,
    ProductSaleEarningReversalService,
    PayrollCalculator,
    StaffCompensationService,
    StaffEarningsService,
    PayrollPeriodService,
    PayrollReportService,
  ],
  exports: [StaffEarningsService],
})
export class PayrollModule {}
