ALTER TYPE "TaskScope" ADD VALUE 'INDIVIDUAL';

CREATE TABLE "task_batch" (
  "id" TEXT NOT NULL,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "createdById" TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_batch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskBatch_recipient_count_check" CHECK ("recipientCount" > 0)
);

CREATE UNIQUE INDEX "task_batch_public_id_key" ON "task_batch"("public_id");
CREATE INDEX "task_batch_createdById_createdAt_idx" ON "task_batch"("createdById", "createdAt");

ALTER TABLE "task"
  ADD COLUMN "batchId" TEXT,
  ADD COLUMN "reviewerUserId" TEXT;

UPDATE "task" AS task
SET "reviewerUserId" = team."adminId"
FROM "team" AS team
WHERE task."teamId" = team."id"
  AND task."completionMode" = 'REVIEW_REQUIRED';

DROP INDEX IF EXISTS "task_scope_idx";
DROP INDEX IF EXISTS "task_scope_status_idx";
ALTER TABLE "task" DROP CONSTRAINT IF EXISTS "Task_scope_team_check";

ALTER TABLE "task"
  ADD CONSTRAINT "Task_scope_team_check"
  CHECK (
    ("scope" = 'TEAM' AND "teamId" IS NOT NULL)
    OR
    ("scope" = 'GLOBAL' AND "teamId" IS NULL)
    OR
    ("scope" = 'INDIVIDUAL')
  );

CREATE INDEX "task_scope_idx" ON "task"("scope");
CREATE INDEX "task_scope_status_idx" ON "task"("scope", "status");
CREATE INDEX "task_batchId_idx" ON "task"("batchId");
CREATE INDEX "task_reviewerUserId_idx" ON "task"("reviewerUserId");

ALTER TABLE "task_batch"
  ADD CONSTRAINT "task_batch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task"
  ADD CONSTRAINT "task_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "task_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_reviewerUserId_fkey"
  FOREIGN KEY ("reviewerUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_submission"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastEditedById" TEXT;

CREATE INDEX "task_submission_lastEditedById_idx" ON "task_submission"("lastEditedById");

ALTER TABLE "task_submission"
  ADD CONSTRAINT "task_submission_lastEditedById_fkey"
  FOREIGN KEY ("lastEditedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
