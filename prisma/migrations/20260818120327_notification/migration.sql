-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_receiverId_readAt_createdAt_idx" ON "notification"("receiverId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notification_receiverId_createdAt_idx" ON "notification"("receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_type_createdAt_idx" ON "notification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "notification_targetType_targetId_idx" ON "notification"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
