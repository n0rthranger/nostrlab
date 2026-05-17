DROP INDEX "DeletedEvent_deletionNostrId_key";

CREATE INDEX "DeletedEvent_deletionNostrId_idx" ON "DeletedEvent"("deletionNostrId");
