ALTER TABLE "Brand" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Location" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Brand" ADD COLUMN "restoredAt" TIMESTAMP(3);
ALTER TABLE "Location" ADD COLUMN "restoredAt" TIMESTAMP(3);

CREATE INDEX "Brand_deletedAt_idx" ON "Brand"("deletedAt");
CREATE INDEX "Location_brandId_deletedAt_idx" ON "Location"("brandId", "deletedAt");
DROP INDEX "Location_brandId_idx";

CREATE FUNCTION record_business_restoration() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL THEN
    NEW."restoredAt" := timezone('UTC', statement_timestamp());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_restoration
BEFORE UPDATE OF "deletedAt" ON "Brand"
FOR EACH ROW EXECUTE FUNCTION record_business_restoration();

CREATE TRIGGER location_restoration
BEFORE UPDATE OF "deletedAt" ON "Location"
FOR EACH ROW EXECUTE FUNCTION record_business_restoration();
