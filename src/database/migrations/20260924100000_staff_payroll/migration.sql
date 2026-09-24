-- CreateEnum
CREATE TYPE "StaffEarningType" AS ENUM ('SERVICE_COMMISSION', 'PRODUCT_COMMISSION', 'HOURLY', 'FIXED_SALARY', 'BONUS', 'DEDUCTION', 'CORRECTION');

-- CreateEnum
CREATE TYPE "StaffEarningSource" AS ENUM ('BOOKING', 'SHIFT', 'PRODUCT_SALE', 'MANUAL', 'PAYROLL', 'IMPORT');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "StaffEmploymentType" AS ENUM ('LABOR_CONTRACT', 'CIVIL_CONTRACT', 'SELF_EMPLOYED', 'INDIVIDUAL_ENTREPRENEUR');

-- CreateEnum
CREATE TYPE "StaffPayoutMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "CompensationSalaryMode" AS ENUM ('ADDITIVE', 'GUARANTEED_MINIMUM');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PAYROLL';

-- AlterEnum
ALTER TYPE "AuditEvent" ADD VALUE 'STAFF_COMPENSATION_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'STAFF_EARNING_ADDED';
ALTER TYPE "AuditEvent" ADD VALUE 'STAFF_EARNING_REVERSED';
ALTER TYPE "AuditEvent" ADD VALUE 'PAYROLL_PERIOD_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PAYROLL_PERIOD_DELETED';
ALTER TYPE "AuditEvent" ADD VALUE 'PAYROLL_CALCULATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PAYROLL_APPROVED';
ALTER TYPE "AuditEvent" ADD VALUE 'PAYROLL_PAID';
ALTER TYPE "AuditEvent" ADD VALUE 'PAYROLL_CORRECTED';

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN "employmentType" "StaffEmploymentType",
ADD COLUMN "taxId" VARCHAR(20),
ADD COLUMN "employeeNumber" VARCHAR(30),
ADD COLUMN "payoutMethod" "StaffPayoutMethod",
ADD COLUMN "payoutNote" VARCHAR(250);

-- CreateTable
CREATE TABLE "StaffCompensationPlan" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "fixedSalaryAmount" DECIMAL(12,2),
    "hourlyRate" DECIMAL(10,2),
    "serviceCommissionPercent" DECIMAL(5,2),
    "productCommissionPercent" DECIMAL(5,2),
    "salaryMode" "CompensationSalaryMode" NOT NULL DEFAULT 'GUARANTEED_MINIMUM',
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffCompensationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffCompensationServiceRate" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "StaffCompensationServiceRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffEarning" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "type" "StaffEarningType" NOT NULL,
    "source" "StaffEarningSource" NOT NULL,
    "earnedOn" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "baseAmount" DECIMAL(12,2),
    "ratePercent" DECIMAL(5,2),
    "rateAmount" DECIMAL(10,2),
    "quantity" DECIMAL(10,2),
    "description" VARCHAR(500),
    "reason" VARCHAR(1000),
    "actorId" TEXT,
    "actorName" VARCHAR(300),
    "idempotencyKey" TEXT NOT NULL,
    "compensationPlanId" TEXT,
    "bookingId" TEXT,
    "shiftId" TEXT,
    "externalId" VARCHAR(100),
    "reversesEarningId" TEXT,
    "correctsPayrollResultId" TEXT,
    "payrollResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" VARCHAR(255),
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "calculatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedByName" VARCHAR(300),
    "paidById" TEXT,
    "paidByName" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollResult" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" VARCHAR(250) NOT NULL,
    "roleTitle" VARCHAR(250),
    "taxId" VARCHAR(20),
    "employeeNumber" VARCHAR(30),
    "employmentType" "StaffEmploymentType",
    "payoutMethod" "StaffPayoutMethod",
    "payoutNote" VARCHAR(250),
    "currency" VARCHAR(3) NOT NULL,
    "fixedSalaryTotal" DECIMAL(12,2) NOT NULL,
    "hourlyTotal" DECIMAL(12,2) NOT NULL,
    "serviceCommissionTotal" DECIMAL(12,2) NOT NULL,
    "productCommissionTotal" DECIMAL(12,2) NOT NULL,
    "bonusTotal" DECIMAL(12,2) NOT NULL,
    "deductionTotal" DECIMAL(12,2) NOT NULL,
    "correctionTotal" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "earningsCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffCompensationPlan_staffId_effectiveFrom_key" ON "StaffCompensationPlan"("staffId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "StaffCompensationPlan_businessId_idx" ON "StaffCompensationPlan"("businessId");

-- CreateIndex
CREATE INDEX "StaffCompensationPlan_staffId_effectiveFrom_effectiveTo_idx" ON "StaffCompensationPlan"("staffId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "StaffCompensationServiceRate_planId_serviceId_key" ON "StaffCompensationServiceRate"("planId", "serviceId");

-- CreateIndex
CREATE INDEX "StaffCompensationServiceRate_planId_idx" ON "StaffCompensationServiceRate"("planId");

-- CreateIndex
CREATE INDEX "StaffCompensationServiceRate_serviceId_idx" ON "StaffCompensationServiceRate"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffEarning_reversesEarningId_key" ON "StaffEarning"("reversesEarningId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffEarning_businessId_idempotencyKey_key" ON "StaffEarning"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StaffEarning_businessId_staffId_earnedOn_idx" ON "StaffEarning"("businessId", "staffId", "earnedOn");

-- CreateIndex
CREATE INDEX "StaffEarning_businessId_earnedOn_idx" ON "StaffEarning"("businessId", "earnedOn");

-- CreateIndex
CREATE INDEX "StaffEarning_bookingId_idx" ON "StaffEarning"("bookingId");

-- CreateIndex
CREATE INDEX "StaffEarning_shiftId_idx" ON "StaffEarning"("shiftId");

-- CreateIndex
CREATE INDEX "StaffEarning_payrollResultId_idx" ON "StaffEarning"("payrollResultId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_businessId_startDate_endDate_key" ON "PayrollPeriod"("businessId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PayrollPeriod_businessId_status_idx" ON "PayrollPeriod"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollResult_periodId_staffId_key" ON "PayrollResult"("periodId", "staffId");

-- CreateIndex
CREATE INDEX "PayrollResult_businessId_idx" ON "PayrollResult"("businessId");

-- CreateIndex
CREATE INDEX "PayrollResult_staffId_idx" ON "PayrollResult"("staffId");

-- AddForeignKey
ALTER TABLE "StaffCompensationPlan" ADD CONSTRAINT "StaffCompensationPlan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCompensationPlan" ADD CONSTRAINT "StaffCompensationPlan_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCompensationServiceRate" ADD CONSTRAINT "StaffCompensationServiceRate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StaffCompensationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCompensationServiceRate" ADD CONSTRAINT "StaffCompensationServiceRate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_compensationPlanId_fkey" FOREIGN KEY ("compensationPlanId") REFERENCES "StaffCompensationPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "StaffShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_reversesEarningId_fkey" FOREIGN KEY ("reversesEarningId") REFERENCES "StaffEarning"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_correctsPayrollResultId_fkey" FOREIGN KEY ("correctsPayrollResultId") REFERENCES "PayrollResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffEarning" ADD CONSTRAINT "StaffEarning_payrollResultId_fkey" FOREIGN KEY ("payrollResultId") REFERENCES "PayrollResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollResult" ADD CONSTRAINT "PayrollResult_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollResult" ADD CONSTRAINT "PayrollResult_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollResult" ADD CONSTRAINT "PayrollResult_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
