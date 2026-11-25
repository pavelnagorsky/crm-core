-- Pricing stage 5 (docs/pricing-stage5-api.md): repricing on reschedule, the stored discount
-- choice of a booking item, the "was" price of the pending reschedule email.
-- CreateEnum
CREATE TYPE "DiscountChoiceMode" AS ENUM ('AUTO', 'NONE', 'RULE', 'CLIENT_DISCOUNT');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "clientNoticeFromTotal" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "BookingItem" ADD COLUMN     "discountChoice" "DiscountChoiceMode",
ADD COLUMN     "discountChoiceRuleId" TEXT;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_discountChoiceRuleId_fkey" FOREIGN KEY ("discountChoiceRuleId") REFERENCES "PriceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AUTO is stored as null; a rule belongs to RULE only (a RULE whose rule is gone reads as AUTO).
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_discountChoice_check" CHECK (
  ("discountChoice" IS NULL OR "discountChoice" <> 'AUTO')
  AND ("discountChoiceRuleId" IS NULL OR "discountChoice" = 'RULE')
);
