-- CreateEnum
CREATE TYPE "SupportRequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'SPAM');

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" VARCHAR(254) NOT NULL,
    "message" VARCHAR(5000) NOT NULL,
    "status" "SupportRequestStatus" NOT NULL DEFAULT 'NEW',
    "notes" VARCHAR(10000),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportRequestAttachment" (
    "supportRequestId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "SupportRequestAttachment_pkey" PRIMARY KEY ("supportRequestId","fileId")
);

-- CreateIndex
CREATE INDEX "SupportRequest_status_createdAt_id_idx" ON "SupportRequest"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SupportRequest_createdAt_id_idx" ON "SupportRequest"("createdAt", "id");

-- CreateIndex
CREATE INDEX "SupportRequest_userId_idx" ON "SupportRequest"("userId");

-- CreateIndex
CREATE INDEX "SupportRequestAttachment_fileId_idx" ON "SupportRequestAttachment"("fileId");

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequestAttachment" ADD CONSTRAINT "SupportRequestAttachment_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequestAttachment" ADD CONSTRAINT "SupportRequestAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity checks (not expressible in Prisma schema)
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_message_check" CHECK (BTRIM("message") <> '');
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_email_check" CHECK (BTRIM("email") <> '' AND "email" = LOWER("email"));
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_resolvedAt_check" CHECK (("status" = 'RESOLVED') = ("resolvedAt" IS NOT NULL));
ALTER TABLE "SupportRequestAttachment" ADD CONSTRAINT "SupportRequestAttachment_position_check" CHECK ("position" >= 0);
