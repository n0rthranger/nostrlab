-- Durable outbound notification delivery and saved discovery alerts.

ALTER TYPE "NotificationType" ADD VALUE 'DISCOVERY_ALERT';

CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('NOSTR_DM', 'WEBHOOK');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "recipientPubkey" TEXT NOT NULL,
  "channel" "NotificationDeliveryChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "providerRef" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedEventSearch" (
  "id" TEXT NOT NULL,
  "pubkey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" TEXT,
  "city" TEXT,
  "tag" TEXT,
  "category" TEXT,
  "mode" TEXT,
  "paid" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "radiusKm" INTEGER,
  "lastNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SavedEventSearch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");
CREATE INDEX "NotificationDelivery_recipientPubkey_status_idx" ON "NotificationDelivery"("recipientPubkey", "status");
CREATE INDEX "NotificationDelivery_channel_status_idx" ON "NotificationDelivery"("channel", "status");

CREATE INDEX "SavedEventSearch_pubkey_createdAt_idx" ON "SavedEventSearch"("pubkey", "createdAt");
CREATE INDEX "SavedEventSearch_lastNotifiedAt_idx" ON "SavedEventSearch"("lastNotifiedAt");

ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedEventSearch"
  ADD CONSTRAINT "SavedEventSearch_pubkey_fkey"
  FOREIGN KEY ("pubkey") REFERENCES "User"("pubkey") ON DELETE CASCADE ON UPDATE CASCADE;
