ALTER TABLE "Event"
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "duplicateOfId" TEXT;

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_duplicateOfId_fkey"
  FOREIGN KEY ("duplicateOfId") REFERENCES "Event"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Event_dedupeKey_idx" ON "Event"("dedupeKey");
CREATE INDEX "Event_duplicateOfId_idx" ON "Event"("duplicateOfId");

CREATE UNIQUE INDEX "Event_dedupeKey_active_unique"
  ON "Event"("dedupeKey")
  WHERE "dedupeKey" IS NOT NULL
    AND "duplicateOfId" IS NULL
    AND "status" = 'ACTIVE';
