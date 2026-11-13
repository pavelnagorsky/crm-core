-- Support attachments move from public File rows to a private bucket with their own table.
-- No data is carried over: refuse to run if attachments already exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "SupportRequestAttachment") THEN
    RAISE EXCEPTION 'SupportRequestAttachment is not empty; move the files to the private bucket first';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "SupportRequestAttachment" DROP CONSTRAINT "SupportRequestAttachment_supportRequestId_fkey";

-- DropForeignKey
ALTER TABLE "SupportRequestAttachment" DROP CONSTRAINT "SupportRequestAttachment_fileId_fkey";

-- DropTable
DROP TABLE "SupportRequestAttachment";

-- CreateTable
CREATE TABLE "SupportAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "supportRequestId" TEXT,
    "position" SMALLINT,
    "storageKey" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportAttachment_supportRequestId_position_idx" ON "SupportAttachment"("supportRequestId", "position");

-- CreateIndex
CREATE INDEX "SupportAttachment_userId_idx" ON "SupportAttachment"("userId");

-- CreateIndex
CREATE INDEX "SupportAttachment_createdAt_idx" ON "SupportAttachment"("createdAt");

-- AddForeignKey
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_supportRequestId_fkey" FOREIGN KEY ("supportRequestId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity checks (not expressible in Prisma schema)
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_position_check" CHECK ("position" >= 0);
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_link_check" CHECK (("supportRequestId" IS NULL) = ("position" IS NULL));
