-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Staff" DROP COLUMN "deactivatedAt",
DROP COLUMN "isActive",
ADD COLUMN     "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE';
