CREATE TYPE "TaskScope" AS ENUM ('TEAM', 'GLOBAL');
CREATE TYPE "TaskDistributionStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED');

ALTER TABLE "task"
  ADD COLUMN "scope" "TaskScope" NOT NULL DEFAULT 'TEAM';

ALTER TABLE "task_recurrence"
  ADD COLUMN "scope" "TaskScope" NOT NULL DEFAULT 'TEAM',
  ADD COLUMN "broadcastAll" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "distributionLeadMinutes" INTEGER;

UPDATE "task" SET "scope" = 'TEAM';
UPDATE "task_recurrence" SET "scope" = 'TEAM';

ALTER TABLE "task" ALTER COLUMN "teamId" DROP NOT NULL;
ALTER TABLE "task_recurrence" ALTER COLUMN "teamId" DROP NOT NULL;

ALTER TABLE "task"
  ADD CONSTRAINT "Task_scope_team_check"
  CHECK (
    ("scope" = 'TEAM' AND "teamId" IS NOT NULL)
    OR
    ("scope" = 'GLOBAL' AND "teamId" IS NULL)
  );

ALTER TABLE "task_recurrence"
  ADD CONSTRAINT "TaskRecurrence_scope_team_check"
  CHECK (
    ("scope" = 'TEAM' AND "teamId" IS NOT NULL)
    OR
    ("scope" = 'GLOBAL' AND "teamId" IS NULL)
  ),
  ADD CONSTRAINT "TaskRecurrence_broadcast_check"
  CHECK (
    ("broadcastAll" = false AND "distributionLeadMinutes" IS NULL)
    OR
    (
      "scope" = 'GLOBAL'
      AND "broadcastAll" = true
      AND "distributionLeadMinutes" BETWEEN 0 AND 10080
    )
  );

CREATE TABLE "task_distribution" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" "TaskDistributionStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_distribution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_scope_idx" ON "task"("scope");
CREATE INDEX "task_scope_status_idx" ON "task"("scope", "status");
CREATE UNIQUE INDEX "task_distribution_taskId_key" ON "task_distribution"("taskId");
CREATE INDEX "task_distribution_status_scheduledAt_idx"
  ON "task_distribution"("status", "scheduledAt");

ALTER TABLE "task_distribution"
  ADD CONSTRAINT "task_distribution_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
