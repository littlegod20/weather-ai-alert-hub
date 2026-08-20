-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('RAIN', 'EXTREME_WIND', 'FROST', 'DROUGHT');

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "units" TEXT NOT NULL DEFAULT 'metric',
    "triggers" "TriggerType"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "triggerType" "TriggerType" NOT NULL,
    "message" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollLog" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "polledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cacheHit" BOOLEAN NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "quotaRemaining" INTEGER,

    CONSTRAINT "PollLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaSnapshot" (
    "id" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "limitTotal" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_active_idx" ON "Location"("active");

-- CreateIndex
CREATE INDEX "AlertEvent_locationId_triggeredAt_idx" ON "AlertEvent"("locationId", "triggeredAt");

-- CreateIndex
CREATE INDEX "PollLog_locationId_polledAt_idx" ON "PollLog"("locationId", "polledAt");

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollLog" ADD CONSTRAINT "PollLog_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
