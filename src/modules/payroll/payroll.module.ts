import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module.js';
import { ServicesModule } from '../services/services.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { StaffCompensationController } from './compensation/staff-compensation.controller.js';
import { StaffCompensationService } from './compensation/staff-compensation.service.js';
import { EarningCalculatorService } from './earnings/earning-calculator.service.js';
import { StaffEarningsController } from './earnings/staff-earnings.controller.js';
import { StaffEarningsService } from './earnings/staff-earnings.service.js';
import { PayrollComputeService } from './periods/payroll-compute.service.js';
import { PayrollController } from './periods/payroll.controller.js';
import { PayrollService } from './periods/payroll.service.js';
import { PayrollReportService } from './report/payroll-report.service.js';

@Module({
  imports: [StaffModule, BusinessModule, ServicesModule],
  controllers: [StaffCompensationController, StaffEarningsController, PayrollController],
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
