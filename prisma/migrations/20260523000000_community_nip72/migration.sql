-- Store the signed NIP-72 community definition we publish to relays.
ALTER TABLE "Community" ADD COLUMN "nostrId" TEXT;
ALTER TABLE "Community" ADD COLUMN "rawEvent" JSONB;

CREATE UNIQUE INDEX "Community_nostrId_key" ON "Community"("nostrId");
