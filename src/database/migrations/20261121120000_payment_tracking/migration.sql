-- CreateEnum
CREATE TYPE "PaymentTrackingMode" AS ENUM ('MANUAL', 'DISABLED');

-- AlterTable
ALTER TABLE "Location"
  ADD COLUMN "paymentTrackingMode" "PaymentTrackingMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "paymentTrackingSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
