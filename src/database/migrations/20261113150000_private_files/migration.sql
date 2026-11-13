-- Private files become a general table owned by the files module; support
-- requests reference them through a join table. Existing support attachments
-- keep their ids and storage objects.

-- CreateTable
CREATE TABLE "PrivateFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "storageKey" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "attachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportRequestAttachment" (
    "supportRequestId" TEXT NOT NULL,
    "privateFileId" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "SupportRequestAttachment_pkey" PRIMARY KEY ("supportRequestId","privateFileId")
);

-- Move data
INSERT INTO "PrivateFile" ("id", "userId", "storageKey", "fileName", "mimeType", "fileSizeBytes", "attachedAt", "createdAt")
SELECT "id", "userId", "storageKey", "fileName", "mimeType", "fileSizeBytes",
       CASE WHEN "supportRequestId" IS NULL THEN NULL ELSE "createdAt" END,
       "createdAt"
FROM "SupportAttachment";

INSERT INTO "SupportRequestAttachment" ("supportRequestId", "privateFileId", "position")
SELECT "supportRequestId", "id", "position"
FROM "SupportAttachment"
WHERE "supportRequestId" IS NOT NULL;

-- DropTable
DROP TABLE "SupportAttachment";

-- CreateIndex
CREATE INDEX "PrivateFile_userId_idx" ON "PrivateFile"("userId");

-- CreateIndex
CREATE INDEX "PrivateFile_attachedAt_createdAt_idx" ON "PrivateFile"("attachedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportRequestAttachment_privateFileId_key" ON "SupportRequestAttachment"("privateFileId");

-- AddForeignKey
ALTER TABLE "PrivateFile" ADD CONSTRAINT "PrivateFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequestAttachment" ADD CONSTRAINT "SupportRequestAttachment_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequestAttachment" ADD CONSTRAINT "SupportRequestAttachment_privateFileId_fkey" FOREIGN KEY ("privateFileId") REFERENCES "PrivateFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity checks (not expressible in Prisma schema)
ALTER TABLE "SupportRequestAttachment" ADD CONSTRAINT "SupportRequestAttachment_position_check" CHECK ("position" >= 0);
