CREATE TYPE "TaskBatchScope" AS ENUM ('TEAM', 'GLOBAL');

ALTER TABLE "task_batch"
  ADD COLUMN "scope" "TaskBatchScope",
  ADD COLUMN "teamId" TEXT,
  ADD COLUMN "recurrenceId" TEXT,
  ADD COLUMN "occurrenceKey" TEXT;

UPDATE "task_batch" SET "scope" = 'GLOBAL' WHERE "scope" IS NULL;

ALTER TABLE "task_batch"
  ALTER COLUMN "scope" SET NOT NULL,
  ADD CONSTRAINT "TaskBatch_scope_team_check"
  CHECK (
    ("scope" = 'TEAM' AND "teamId" IS NOT NULL)
    OR
    ("scope" = 'GLOBAL' AND "teamId" IS NULL)
  );

CREATE TABLE "task_batch_recurrence" (
  "id" TEXT NOT NULL,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "createdById" TEXT NOT NULL,
  "scope" "TaskBatchScope" NOT NULL,
  "teamId" TEXT,
  "categoryId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "remarks" TEXT,
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "frequency" "TaskRecurrenceFrequency" NOT NULL,
  "anchorDueAt" TIMESTAMP(3) NOT NULL,
  "anchorLocalDay" INTEGER,
  "anchorLocalWeekday" INTEGER,
  "anchorLocalTime" TEXT NOT NULL,
  "nextOccurrenceAt" TIMESTAMP(3) NOT NULL,
  "reminderLeadMinutes" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastBlockedOccurrenceKey" TEXT,
  "lastBlockedReason" "TaskRecurrenceBlockedReason",
  "lastBlockedNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_batch_recurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskBatchRecurrence_scope_team_check"
  CHECK (
    ("scope" = 'TEAM' AND "teamId" IS NOT NULL)
    OR
    ("scope" = 'GLOBAL' AND "teamId" IS NULL)
  ),
  CONSTRAINT "TaskBatchRecurrence_reminder_lead_check"
  CHECK (
    "reminderLeadMinutes" IS NULL
    OR "reminderLeadMinutes" BETWEEN 0 AND 10080
  )
);

CREATE UNIQUE INDEX "task_batch_recurrence_public_id_key"
  ON "task_batch_recurrence"("public_id");
CREATE INDEX "task_batch_recurrence_isActive_nextOccurrenceAt_idx"
  ON "task_batch_recurrence"("isActive", "nextOccurrenceAt");
CREATE INDEX "task_batch_recurrence_createdById_idx"
  ON "task_batch_recurrence"("createdById");
CREATE INDEX "task_batch_recurrence_teamId_idx"
  ON "task_batch_recurrence"("teamId");

CREATE UNIQUE INDEX "task_batch_recurrenceId_occurrenceKey_key"
  ON "task_batch"("recurrenceId", "occurrenceKey");
CREATE INDEX "task_batch_scope_createdAt_idx"
  ON "task_batch"("scope", "createdAt");
CREATE INDEX "task_batch_teamId_idx" ON "task_batch"("teamId");
CREATE INDEX "task_batch_recurrenceId_idx" ON "task_batch"("recurrenceId");

ALTER TABLE "task_batch_recurrence"
  ADD CONSTRAINT "task_batch_recurrence_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_batch_recurrence_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_batch_recurrence_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "task_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_batch"
  ADD CONSTRAINT "task_batch_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_batch_recurrenceId_fkey"
  FOREIGN KEY ("recurrenceId") REFERENCES "task_batch_recurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
