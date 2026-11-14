-- Last confirmation email send time; throttles POST /auth/resend-confirmation-email.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailConfirmationSentAt" TIMESTAMP(3);
