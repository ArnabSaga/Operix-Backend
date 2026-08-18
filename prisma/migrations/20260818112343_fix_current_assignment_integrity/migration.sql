/*
  Warnings:

  - You are about to drop the column `currentAssignmentId` on the `task` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "task" DROP CONSTRAINT "task_currentAssignmentId_fkey";

-- DropIndex
DROP INDEX "task_currentAssignmentId_key";

-- AlterTable
ALTER TABLE "task" DROP COLUMN "currentAssignmentId";

-- Create partial unique index for one active assignment per task.
CREATE UNIQUE INDEX "task_assignment_one_active_per_task_idx"
ON "task_assignment"("taskId")
WHERE "unassignedAt" IS NULL;
