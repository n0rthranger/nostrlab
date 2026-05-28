-- NIP-52 community calendar lists and NIP-72 community post moderation.

ALTER TABLE "Community" ADD COLUMN "calendarNostrId" TEXT;
ALTER TABLE "Community" ADD COLUMN "rawCalendarEvent" JSONB;

CREATE UNIQUE INDEX "Community_calendarNostrId_key" ON "Community"("calendarNostrId");

CREATE TABLE "CommunityPost" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "pubkey" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "nostrId" TEXT NOT NULL,
  "rawEvent" JSONB NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityPostApproval" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "pubkey" TEXT NOT NULL,
  "nostrId" TEXT NOT NULL,
  "rawEvent" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunityPostApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityPost_nostrId_key" ON "CommunityPost"("nostrId");
CREATE INDEX "CommunityPost_communityId_approvedAt_createdAt_idx" ON "CommunityPost"("communityId", "approvedAt", "createdAt");
CREATE INDEX "CommunityPost_pubkey_idx" ON "CommunityPost"("pubkey");

CREATE UNIQUE INDEX "CommunityPostApproval_nostrId_key" ON "CommunityPostApproval"("nostrId");
CREATE UNIQUE INDEX "CommunityPostApproval_postId_pubkey_key" ON "CommunityPostApproval"("postId", "pubkey");
CREATE INDEX "CommunityPostApproval_communityId_createdAt_idx" ON "CommunityPostApproval"("communityId", "createdAt");
CREATE INDEX "CommunityPostApproval_pubkey_idx" ON "CommunityPostApproval"("pubkey");

ALTER TABLE "CommunityPost"
  ADD CONSTRAINT "CommunityPost_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityPost"
  ADD CONSTRAINT "CommunityPost_pubkey_fkey"
  FOREIGN KEY ("pubkey") REFERENCES "User"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommunityPostApproval"
  ADD CONSTRAINT "CommunityPostApproval_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityPostApproval"
  ADD CONSTRAINT "CommunityPostApproval_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityPostApproval"
  ADD CONSTRAINT "CommunityPostApproval_pubkey_fkey"
  FOREIGN KEY ("pubkey") REFERENCES "User"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;
