CREATE TABLE "DeletedEvent" (
    "id" TEXT NOT NULL,
    "organizerPubkey" TEXT NOT NULL,
    "dTag" TEXT NOT NULL,
    "eventNostrId" TEXT,
    "deletionNostrId" TEXT NOT NULL,
    "deletionCreatedAt" INTEGER NOT NULL,
    "reason" TEXT,
    "rawEvent" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeletedEvent_deletionNostrId_key" ON "DeletedEvent"("deletionNostrId");
CREATE UNIQUE INDEX "DeletedEvent_organizerPubkey_dTag_key" ON "DeletedEvent"("organizerPubkey", "dTag");
CREATE INDEX "DeletedEvent_eventNostrId_idx" ON "DeletedEvent"("eventNostrId");
CREATE INDEX "DeletedEvent_organizerPubkey_idx" ON "DeletedEvent"("organizerPubkey");
