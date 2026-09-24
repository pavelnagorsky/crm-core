-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "status" "ServiceStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "Service" SET "status" = 'INACTIVE' WHERE "isActive" = false;

ALTER TABLE "Service" DROP COLUMN "isActive";
