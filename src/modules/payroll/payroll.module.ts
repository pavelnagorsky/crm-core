import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { ServicesModule } from '../services/services.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { StaffCompensationController } from './compensation/staff-compensation.controller.js';
import { StaffCompensationService } from './compensation/staff-compensation.service.js';
import { EarningCalculatorService } from './earnings/services/earning-calculator.service.js';
import { StaffEarningsController } from './earnings/staff-earnings.controller.js';
import { StaffEarningsService } from './earnings/staff-earnings.service.js';
import { PayrollComputeService } from './periods/services/payroll-compute.service.js';
import { PayrollController } from './periods/payroll.controller.js';
import { PayrollService } from './periods/payroll.service.js';
import { PayrollReportService } from './report/payroll-report.service.js';
import { I18nModule } from '../../shared/i18n/i18n.module.js';

@Module({
  imports: [StaffModule, LocationModule, ServicesModule, I18nModule],
  controllers: [
    StaffCompensationController,
    StaffEarningsController,
    PayrollController,
  ],
  providers: [
    EarningCalculatorService,
    PayrollComputeService,
    StaffCompensationService,
    StaffEarningsService,
    PayrollService,
    PayrollReportService,
  ],
  exports: [StaffEarningsService],
})
export class PayrollModule {}
