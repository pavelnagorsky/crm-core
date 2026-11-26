-- Price a staff commission percent is taken from (docs/pricing-stage8-api.md, «Зарплата: база процента»):
-- CHARGED is the price after discounts (the behaviour before this migration), LIST is the list price.
CREATE TYPE "CommissionBase" AS ENUM ('CHARGED', 'LIST');

ALTER TABLE "StaffCompensationPlan" ADD COLUMN "commissionBase" "CommissionBase" NOT NULL DEFAULT 'CHARGED';
