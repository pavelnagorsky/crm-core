BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "BrandMembership" WHERE "role" = 'STAFF') THEN
  RAISE EXCEPTION 'RBAC migration requires explicit conversion of brand STAFF memberships to location memberships with staff profiles';
 END IF;
 IF EXISTS (SELECT 1 FROM "Brand" b WHERE b."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "BrandMembership" m WHERE m."brandId" = b."id" AND m."role" = 'OWNER')) THEN
  RAISE EXCEPTION 'RBAC migration requires an OWNER for each active brand';
 END IF;
 IF EXISTS (SELECT 1 FROM "LocationMembership" m WHERE m."role" = 'STAFF' AND NOT EXISTS (SELECT 1 FROM "Staff" s WHERE s."locationId" = m."locationId" AND s."userId" = m."userId" AND s."status" = 'ACTIVE')) THEN
  RAISE EXCEPTION 'RBAC migration requires an active staff profile for each location STAFF membership';
 END IF;
END $$;
-- DropForeignKey
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_logoFileId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_imageFileId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_imageFileId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceBundle" DROP CONSTRAINT "ServiceBundle_imageFileId_fkey";

-- DropForeignKey
ALTER TABLE "Staff" DROP CONSTRAINT "Staff_avatarFileId_fkey";

-- DropForeignKey
ALTER TABLE "BookingPage" DROP CONSTRAINT "BookingPage_coverFileId_fkey";

-- CreateTable
CREATE TABLE "AccessState" (
    "brandId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccessState_pkey" PRIMARY KEY ("brandId")
);

-- CreateTable
CREATE TABLE "BrandPermissionOverride" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL,
    "permission" VARCHAR(100) NOT NULL,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "BrandPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPermissionOverride" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL,
    "permission" VARCHAR(100) NOT NULL,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "LocationPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessInvitation" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccessInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessInvitationGrant" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "locationId" TEXT,
    "role" "BusinessRole" NOT NULL,
    "staffId" TEXT,

    CONSTRAINT "AccessInvitationGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAudit" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "locationId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "targetId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandPermissionOverride_brandId_role_permission_key" ON "BrandPermissionOverride"("brandId", "role", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "LocationPermissionOverride_locationId_role_permission_key" ON "LocationPermissionOverride"("locationId", "role", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "AccessInvitation_tokenHash_key" ON "AccessInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessInvitation_brandId_createdAt_idx" ON "AccessInvitation"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessInvitationGrant_staffId_idx" ON "AccessInvitationGrant"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessInvitationGrant_invitationId_scopeId_key" ON "AccessInvitationGrant"("invitationId", "scopeId");

-- CreateIndex
CREATE INDEX "AccessAudit_brandId_createdAt_idx" ON "AccessAudit"("brandId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_locationId_userId_key" ON "Staff"("locationId", "userId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBundle" ADD CONSTRAINT "ServiceBundle_imageFileId_fkey" FOREIGN KEY ("imageFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPage" ADD CONSTRAINT "BookingPage_coverFileId_fkey" FOREIGN KEY ("coverFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessState" ADD CONSTRAINT "AccessState_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandPermissionOverride" ADD CONSTRAINT "BrandPermissionOverride_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPermissionOverride" ADD CONSTRAINT "LocationPermissionOverride_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessInvitation" ADD CONSTRAINT "AccessInvitation_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessInvitationGrant" ADD CONSTRAINT "AccessInvitationGrant_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "AccessInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrandMembership" ADD CONSTRAINT "BrandMembership_no_staff" CHECK ("role" <> 'STAFF');
ALTER TABLE "BrandPermissionOverride" ADD CONSTRAINT "BrandPermissionOverride_no_owner" CHECK ("role" <> 'OWNER');
ALTER TABLE "LocationPermissionOverride" ADD CONSTRAINT "LocationPermissionOverride_no_owner" CHECK ("role" <> 'OWNER');
INSERT INTO "AccessState" ("brandId", "revision") SELECT "id", 0 FROM "Brand" ON CONFLICT DO NOTHING;
UPDATE "StaffInvitation" SET "status" = 'REVOKED', "updatedAt" = CURRENT_TIMESTAMP WHERE "status" = 'PENDING';
COMMIT;
