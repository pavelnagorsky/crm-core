BEGIN;

-- Unreleased invitation tokens were stored only as hashes and cannot be recovered.
-- Memberships and access audit records are independent of invitations and remain intact.
DELETE FROM "AccessInvitation";

ALTER TABLE "AccessInvitation"
  ADD COLUMN "tokenEncrypted" VARCHAR(160) NOT NULL,
  DROP COLUMN "version";

COMMIT;
