-- CreateEnum
CREATE TYPE "EmailAudience" AS ENUM ('CLIENT', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "EmailDeliveryMode" AS ENUM ('QUEUED', 'DIRECT');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'RETRYING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailSkipReason" AS ENUM ('CLIENT_NOTIFICATIONS_DISABLED', 'OUTDATED');

-- CreateEnum
CREATE TYPE "EmailCancelReason" AS ENUM ('ADMIN', 'BOOKING_CHANGED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('QUEUED', 'RETRY_REQUESTED', 'ATTEMPT_FAILED', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "template" VARCHAR(100) NOT NULL,
    "audience" "EmailAudience" NOT NULL,
    "deliveryMode" "EmailDeliveryMode" NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(500),
    "brandId" TEXT,
    "locationId" TEXT,
    "bookingId" TEXT,
    "payload" JSONB,
    "status" "EmailStatus" NOT NULL,
    "skipReason" "EmailSkipReason",
    "cancelReason" "EmailCancelReason",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(2000),
    "lastErrorCode" INTEGER,
    "providerMessageId" VARCHAR(500),
    "jobId" TEXT,
    "validUntil" TIMESTAMP(3),
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "retriedAt" TIMESTAMP(3),
    "retriedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessageEvent" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" "EmailEventType" NOT NULL,
    "attempt" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "error" VARCHAR(2000),
    "errorCode" INTEGER,
    "smtpError" BOOLEAN NOT NULL DEFAULT false,
    "actorId" TEXT,

    CONSTRAINT "EmailMessageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailMessage_queuedAt_idx" ON "EmailMessage"("queuedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_status_queuedAt_idx" ON "EmailMessage"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_recipient_idx" ON "EmailMessage"("recipient");

-- CreateIndex
CREATE INDEX "EmailMessage_brandId_queuedAt_idx" ON "EmailMessage"("brandId", "queuedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_locationId_queuedAt_idx" ON "EmailMessage"("locationId", "queuedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_bookingId_idx" ON "EmailMessage"("bookingId");

-- CreateIndex
CREATE INDEX "EmailMessageEvent_messageId_occurredAt_idx" ON "EmailMessageEvent"("messageId", "occurredAt");

-- CreateIndex
CREATE INDEX "EmailMessageEvent_occurredAt_idx" ON "EmailMessageEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "EmailMessageEvent" ADD CONSTRAINT "EmailMessageEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
