◇ injected env (26) from .env // tip: ⌘ suppress logs { quiet: true }
Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AuditActionType" AS ENUM ('CREATE', 'MODIFY', 'DELETE', 'ACTION');

-- CreateEnum
CREATE TYPE "public"."AuditActorRole" AS ENUM ('CLIENT', 'STAFF', 'OWNER', 'SUPPORT', 'SYSTEM', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "public"."AuditEntity" AS ENUM ('BOOKING', 'CLIENT', 'STAFF', 'SERVICE', 'BUSINESS');

-- CreateEnum
CREATE TYPE "public"."AuditEvent" AS ENUM ('BOOKING_CREATED', 'BOOKING_UPDATED', 'BOOKING_CANCELLED', 'BOOKING_STATUS_CHANGED', 'BOOKING_DELETED', 'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_DELETED', 'STAFF_CREATED', 'STAFF_UPDATED', 'STAFF_DEACTIVATED', 'STAFF_DELETED', 'SERVICE_CREATED', 'SERVICE_UPDATED', 'SERVICE_DELETED', 'BUSINESS_UPDATED');

-- CreateEnum
CREATE TYPE "public"."BookingSource" AS ENUM ('PUBLIC_PAGE', 'WIDGET', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "public"."BookingVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."BusinessRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "public"."CalendarEventRepeatType" AS ENUM ('NONE', 'WEEKLY');

-- CreateEnum
CREATE TYPE "public"."CalendarEventType" AS ENUM ('BLOCK');

-- CreateEnum
CREATE TYPE "public"."CancelledBy" AS ENUM ('CLIENT', 'STAFF');

-- CreateEnum
CREATE TYPE "public"."StaffInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "entityType" "public"."AuditEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" "public"."AuditEvent" NOT NULL,
    "actionType" "public"."AuditActionType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT,
    "actorName" VARCHAR(300) NOT NULL,
    "actorRole" "public"."AuditActorRole" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "public"."BookingSource" NOT NULL,
    "clientFirstName" VARCHAR(100) NOT NULL,
    "clientLastName" VARCHAR(100) NOT NULL,
    "clientPhone" VARCHAR(30) NOT NULL,
    "clientEmail" VARCHAR(254),
    "serviceTitle" VARCHAR(150) NOT NULL,
    "serviceDuration" INTEGER NOT NULL,
    "servicePrice" DECIMAL(10,2) NOT NULL,
    "customPrice" DECIMAL(10,2),
    "staffName" VARCHAR(250) NOT NULL,
    "calendarEventId" TEXT,
    "notes" VARCHAR(1000),
    "internalNotes" VARCHAR(2000),
    "cancellationReason" VARCHAR(1000),
    "cancelledBy" "public"."CancelledBy",
    "cancelledAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Business" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "logoFileId" TEXT,
    "advanceBookingWindowDays" INTEGER NOT NULL DEFAULT 15,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "minimumBookingNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "bookingVisibility" "public"."BookingVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isBookingConfirmationRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CalendarEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT,
    "type" "public"."CalendarEventType" NOT NULL DEFAULT 'BLOCK',
    "reason" VARCHAR(100),
    "title" VARCHAR(255),
    "notes" VARCHAR(1000),
    "repeatType" "public"."CalendarEventRepeatType" NOT NULL DEFAULT 'NONE',
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "daysMask" VARCHAR(7),
    "repeatUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CalendarEventCancelledOccurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventCancelledOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Client" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(254),
    "birthDate" DATE,
    "gender" VARCHAR(20),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."File" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" "public"."BusinessRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RefreshToken" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "userAgent" VARCHAR(512),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Service" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT,
    "imageFileId" TEXT,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000),
    "price" DECIMAL(10,2) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ServiceCategory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Staff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "avatarFileId" TEXT,
    "name" VARCHAR(250) NOT NULL,
    "roleTitle" VARCHAR(250),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffInvitation" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "status" "public"."StaffInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffService" (
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "StaffService_pkey" PRIMARY KEY ("staffId","serviceId")
);

-- CreateTable
CREATE TABLE "public"."StaffShift" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TIME(6) NOT NULL,
    "endTime" TIME(6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "passwordHash" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "isMarketingEmailsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_businessId_entityType_entityId_createdAt_idx" ON "public"."AuditLog"("businessId" ASC, "entityType" ASC, "entityId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_businessId_entityType_entityId_idx" ON "public"."AuditLog"("businessId" ASC, "entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "Booking_businessId_deletedAt_startAt_idx" ON "public"."Booking"("businessId" ASC, "deletedAt" ASC, "startAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_calendarEventId_key" ON "public"."Booking"("calendarEventId" ASC);

-- CreateIndex
CREATE INDEX "Booking_clientId_deletedAt_startAt_idx" ON "public"."Booking"("clientId" ASC, "deletedAt" ASC, "startAt" ASC);

-- CreateIndex
CREATE INDEX "Booking_staffId_deletedAt_startAt_idx" ON "public"."Booking"("staffId" ASC, "deletedAt" ASC, "startAt" ASC);

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "public"."Booking"("status" ASC);

-- CreateIndex
CREATE INDEX "CalendarEvent_businessId_idx" ON "public"."CalendarEvent"("businessId" ASC);

-- CreateIndex
CREATE INDEX "CalendarEvent_businessId_repeatType_startDateTime_idx" ON "public"."CalendarEvent"("businessId" ASC, "repeatType" ASC, "startDateTime" ASC);

-- CreateIndex
CREATE INDEX "CalendarEvent_businessId_staffId_idx" ON "public"."CalendarEvent"("businessId" ASC, "staffId" ASC);

-- CreateIndex
CREATE INDEX "CalendarEventCancelledOccurrence_eventId_idx" ON "public"."CalendarEventCancelledOccurrence"("eventId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventCancelledOccurrence_eventId_occurrenceDate_key" ON "public"."CalendarEventCancelledOccurrence"("eventId" ASC, "occurrenceDate" ASC);

-- CreateIndex
CREATE INDEX "Client_businessId_idx" ON "public"."Client"("businessId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Client_businessId_phone_key" ON "public"."Client"("businessId" ASC, "phone" ASC);

-- CreateIndex
CREATE INDEX "Client_userId_idx" ON "public"."Client"("userId" ASC);

-- CreateIndex
CREATE INDEX "File_userId_idx" ON "public"."File"("userId" ASC);

-- CreateIndex
CREATE INDEX "Membership_businessId_idx" ON "public"."Membership"("businessId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_businessId_key" ON "public"."Membership"("userId" ASC, "businessId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetCode_userId_key" ON "public"."PasswordResetCode"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "public"."RefreshToken"("token" ASC);

-- CreateIndex
CREATE INDEX "Service_businessId_idx" ON "public"."Service"("businessId" ASC);

-- CreateIndex
CREATE INDEX "Service_categoryId_idx" ON "public"."Service"("categoryId" ASC);

-- CreateIndex
CREATE INDEX "ServiceCategory_businessId_idx" ON "public"."ServiceCategory"("businessId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_businessId_name_key" ON "public"."ServiceCategory"("businessId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "Staff_businessId_idx" ON "public"."Staff"("businessId" ASC);

-- CreateIndex
CREATE INDEX "StaffInvitation_businessId_idx" ON "public"."StaffInvitation"("businessId" ASC);

-- CreateIndex
CREATE INDEX "StaffInvitation_expiresAt_idx" ON "public"."StaffInvitation"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "StaffInvitation_staffId_idx" ON "public"."StaffInvitation"("staffId" ASC);

-- CreateIndex
CREATE INDEX "StaffInvitation_status_idx" ON "public"."StaffInvitation"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "public"."StaffInvitation"("tokenHash" ASC);

-- CreateIndex
CREATE INDEX "StaffService_serviceId_idx" ON "public"."StaffService"("serviceId" ASC);

-- CreateIndex
CREATE INDEX "StaffService_staffId_idx" ON "public"."StaffService"("staffId" ASC);

-- CreateIndex
CREATE INDEX "StaffShift_staffId_date_idx" ON "public"."StaffShift"("staffId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StaffShift_staffId_date_key" ON "public"."StaffShift"("staffId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone" ASC);

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "public"."CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Business" ADD CONSTRAINT "Business_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "public"."File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CalendarEvent" ADD CONSTRAINT "CalendarEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CalendarEvent" ADD CONSTRAINT "CalendarEvent_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CalendarEventCancelledOccurrence" ADD CONSTRAINT "CalendarEventCancelledOccurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Client" ADD CONSTRAINT "Client_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PasswordResetCode" ADD CONSTRAINT "PasswordResetCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Service" ADD CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Service" ADD CONSTRAINT "Service_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "public"."File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ServiceCategory" ADD CONSTRAINT "ServiceCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Staff" ADD CONSTRAINT "Staff_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "public"."File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Staff" ADD CONSTRAINT "Staff_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffInvitation" ADD CONSTRAINT "StaffInvitation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffInvitation" ADD CONSTRAINT "StaffInvitation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffService" ADD CONSTRAINT "StaffService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffService" ADD CONSTRAINT "StaffService_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffShift" ADD CONSTRAINT "StaffShift_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

