-- AlterTable
ALTER TABLE "notification"
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolution" TEXT;

-- CreateIndex
CREATE INDEX "notification_targetType_targetId_resolvedAt_idx" ON "notification"("targetType", "targetId", "resolvedAt");

-- Resolve historical registration notifications whose request already reached a
-- terminal state. Notifications are kept as history; only the action state changes.
-- `resolvedAt` preserves the actual decision timestamp so old rows do not pretend
-- the job finished when the migration ran.
UPDATE "notification" AS n
SET "resolvedAt" = CASE r."status"
        WHEN 'APPROVED' THEN COALESCE(r."approvedAt", r."reviewedAt")
        WHEN 'REJECTED' THEN COALESCE(r."rejectedAt", r."reviewedAt")
    END,
    "resolution" = r."status"::TEXT
FROM "registration_request" AS r
WHERE n."targetType" = 'REGISTRATION_REQUEST'
  AND n."targetId" = r."id"
  AND n."resolvedAt" IS NULL
  AND r."status" IN ('APPROVED', 'REJECTED')
  AND CASE r."status"
        WHEN 'APPROVED' THEN COALESCE(r."approvedAt", r."reviewedAt")
        WHEN 'REJECTED' THEN COALESCE(r."rejectedAt", r."reviewedAt")
    END IS NOT NULL;
