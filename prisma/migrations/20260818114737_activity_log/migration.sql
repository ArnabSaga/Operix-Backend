-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_log_actorId_createdAt_idx" ON "activity_log"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_log_entityType_entityId_createdAt_idx" ON "activity_log"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_log_action_createdAt_idx" ON "activity_log"("action", "createdAt");

-- CreateIndex
CREATE INDEX "activity_log_createdAt_idx" ON "activity_log"("createdAt");

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
