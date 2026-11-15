-- Billing is always on: every new brand gets a subscription, no launch step.
ALTER TABLE "BillingSettings" DROP COLUMN "launchedAt";
