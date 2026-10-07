-- Existing sessions intentionally cannot survive the transition from plaintext tokens.
TRUNCATE TABLE "public"."RefreshToken";

DROP INDEX "public"."RefreshToken_token_key";

ALTER TABLE "public"."RefreshToken"
RENAME COLUMN "token" TO "tokenHash";

ALTER TABLE "public"."RefreshToken"
ALTER COLUMN "tokenHash" TYPE VARCHAR(64);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key"
ON "public"."RefreshToken"("tokenHash" ASC);

CREATE INDEX "RefreshToken_userId_expiryDate_idx"
ON "public"."RefreshToken"("userId" ASC, "expiryDate" ASC);
