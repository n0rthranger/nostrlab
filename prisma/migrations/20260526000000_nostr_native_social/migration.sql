-- Store signed Nostr social events instead of local-only auth envelopes.

ALTER TABLE "CommunityFollow" ADD COLUMN "nostrId" TEXT;
ALTER TABLE "CommunityFollow" ADD COLUMN "rawEvent" JSONB;

CREATE TABLE "CommunityFollowList" (
  "pubkey" TEXT NOT NULL,
  "nostrId" TEXT NOT NULL,
  "eventCreatedAt" INTEGER NOT NULL,
  "rawEvent" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityFollowList_pkey" PRIMARY KEY ("pubkey")
);

ALTER TABLE "EventComment" ADD COLUMN "rawEvent" JSONB;
ALTER TABLE "EventAnnouncement" ADD COLUMN "nostrId" TEXT;
ALTER TABLE "EventAnnouncement" ADD COLUMN "rawEvent" JSONB;

CREATE UNIQUE INDEX "CommunityFollowList_nostrId_key" ON "CommunityFollowList"("nostrId");
CREATE INDEX "CommunityFollow_nostrId_idx" ON "CommunityFollow"("nostrId");
CREATE UNIQUE INDEX "EventComment_nostrId_key" ON "EventComment"("nostrId");
CREATE UNIQUE INDEX "EventAnnouncement_nostrId_key" ON "EventAnnouncement"("nostrId");

ALTER TABLE "CommunityFollowList"
  ADD CONSTRAINT "CommunityFollowList_pubkey_fkey"
  FOREIGN KEY ("pubkey") REFERENCES "User"("pubkey") ON DELETE CASCADE ON UPDATE CASCADE;
