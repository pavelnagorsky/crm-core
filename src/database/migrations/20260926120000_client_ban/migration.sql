-- AlterTable
ALTER TABLE "public"."Client" ADD COLUMN "bannedAt" TIMESTAMP(3),
ADD COLUMN "banReason" VARCHAR(500);
