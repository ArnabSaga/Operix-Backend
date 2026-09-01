-- Stage 1 installs UUID defaults before backfill so concurrent inserts cannot create new NULL identities.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "user" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "team" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "task_category" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "task" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "task_submission" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "file_asset" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "task_attachment" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "notification" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "notification" ADD COLUMN "target_public_id" UUID;
ALTER TABLE "activity_log" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "activity_log" ADD COLUMN "entity_public_id" UUID;
ALTER TABLE "management_report" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "inventory_category" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "inventory_item" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "inventory_assignment" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "inventory_transaction" ADD COLUMN "public_id" UUID DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "user_public_id_key" ON "user"("public_id");
CREATE UNIQUE INDEX "team_public_id_key" ON "team"("public_id");
CREATE UNIQUE INDEX "task_category_public_id_key" ON "task_category"("public_id");
CREATE UNIQUE INDEX "task_public_id_key" ON "task"("public_id");
CREATE UNIQUE INDEX "task_submission_public_id_key" ON "task_submission"("public_id");
CREATE UNIQUE INDEX "file_asset_public_id_key" ON "file_asset"("public_id");
CREATE UNIQUE INDEX "task_attachment_public_id_key" ON "task_attachment"("public_id");
CREATE UNIQUE INDEX "notification_public_id_key" ON "notification"("public_id");
CREATE INDEX "notification_targetType_target_public_id_idx" ON "notification"("targetType", "target_public_id");
CREATE UNIQUE INDEX "activity_log_public_id_key" ON "activity_log"("public_id");
CREATE INDEX "activity_log_entityType_entity_public_id_createdAt_idx" ON "activity_log"("entityType", "entity_public_id", "createdAt");
CREATE UNIQUE INDEX "management_report_public_id_key" ON "management_report"("public_id");
CREATE UNIQUE INDEX "inventory_category_public_id_key" ON "inventory_category"("public_id");
CREATE UNIQUE INDEX "inventory_item_public_id_key" ON "inventory_item"("public_id");
CREATE UNIQUE INDEX "inventory_assignment_public_id_key" ON "inventory_assignment"("public_id");
CREATE UNIQUE INDEX "inventory_transaction_public_id_key" ON "inventory_transaction"("public_id");

UPDATE "user" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "team" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "task_category" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "task" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "task_submission" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "file_asset" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "task_attachment" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "notification" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "activity_log" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "management_report" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "inventory_category" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "inventory_item" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "inventory_assignment" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;
UPDATE "inventory_transaction" SET "public_id" = gen_random_uuid() WHERE "public_id" IS NULL;

-- Polymorphic references are translated only through their declared target type.
UPDATE "notification" n SET "target_public_id" = t."public_id" FROM "task" t WHERE n."targetType" = 'TASK' AND n."targetId" = t.id;
UPDATE "notification" n SET "target_public_id" = s."public_id" FROM "task_submission" s WHERE n."targetType" = 'SUBMISSION' AND n."targetId" = s.id;
UPDATE "notification" n SET "target_public_id" = t."public_id" FROM "team" t WHERE n."targetType" = 'TEAM' AND n."targetId" = t.id;
UPDATE "notification" n SET "target_public_id" = r."public_id" FROM "management_report" r WHERE n."targetType" = 'REPORT' AND n."targetId" = r.id;
UPDATE "notification" n SET "target_public_id" = a."public_id" FROM "inventory_assignment" a WHERE n."targetType" = 'INVENTORY_ASSIGNMENT' AND n."targetId" = a.id;

UPDATE "activity_log" a SET "entity_public_id" = u."public_id" FROM "user" u WHERE a."entityType" = 'USER' AND a."entityId" = u.id;
UPDATE "activity_log" a SET "entity_public_id" = t."public_id" FROM "team" t WHERE a."entityType" = 'TEAM' AND a."entityId" = t.id;
UPDATE "activity_log" a SET "entity_public_id" = t."public_id" FROM "task" t WHERE a."entityType" = 'TASK' AND a."entityId" = t.id;
UPDATE "activity_log" a SET "entity_public_id" = r."public_id" FROM "management_report" r WHERE a."entityType" = 'REPORT' AND a."entityId" = r.id;
UPDATE "activity_log" a SET "entity_public_id" = c."public_id" FROM "inventory_category" c WHERE a."entityType" = 'INVENTORY_CATEGORY' AND a."entityId" = c.id;
UPDATE "activity_log" a SET "entity_public_id" = i."public_id" FROM "inventory_item" i WHERE a."entityType" = 'INVENTORY_ITEM' AND a."entityId" = i.id;
UPDATE "activity_log" a SET "entity_public_id" = x."public_id" FROM "inventory_assignment" x WHERE a."entityType" = 'INVENTORY_ASSIGNMENT' AND a."entityId" = x.id;

-- Legacy metadata is migrated by the known action schema. Private locator keys are removed when
-- no unambiguous typed relationship is available; business identifiers remain intact.
UPDATE "activity_log"
SET metadata = metadata - ARRAY[
  'userId','adminId','memberId','teamId','taskId','submissionId','reportId',
  'categoryId','itemId','assignmentId','actorId','assignedById','previousAdminId',
  'newAdminId','sourceTeamId','targetTeamId','fileId','attachmentId','createdById','reviewerId'
]
WHERE metadata IS NOT NULL
  AND action IN (
    'ADMIN_CREATED','ADMIN_UPDATED','ADMIN_STATUS_CHANGED',
    'MEMBER_CREATED','MEMBER_UPDATED','MEMBER_STATUS_CHANGED',
    'TEAM_CREATED','TEAM_UPDATED','TEAM_ADMIN_REASSIGNED','MEMBER_ASSIGNED_TO_TEAM','MEMBER_TRANSFERRED',
    'TASK_CREATED','TASK_ASSIGNED','TASK_STARTED','TASK_ATTACHMENTS_ADDED','TASK_ATTACHMENT_REMOVED',
    'TASK_SUBMITTED','TASK_RESUBMITTED','TASK_APPROVED','TASK_REVISION_REQUESTED',
    'REPORT_CREATED','REPORT_UPDATED','REPORT_SUBMITTED','REPORT_REVIEWED',
    'INVENTORY_CATEGORY_CREATED','INVENTORY_CATEGORY_UPDATED','INVENTORY_CREATED','INVENTORY_UPDATED',
    'INVENTORY_STOCK_IN','INVENTORY_STOCK_OUT','INVENTORY_ADJUSTED','INVENTORY_ASSIGNED','INVENTORY_RETURNED',
    'MEMBER_IMPORT_EXECUTED','HISTORICAL_TASK_IMPORT_EXECUTED'
  );

-- Restore only action-owned public references after removing legacy private references.
UPDATE "activity_log" SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('adminId', "entity_public_id"::text)
WHERE "entity_public_id" IS NOT NULL AND action IN ('ADMIN_CREATED','ADMIN_UPDATED','ADMIN_STATUS_CHANGED');
UPDATE "activity_log" SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('memberId', "entity_public_id"::text)
WHERE "entity_public_id" IS NOT NULL AND action IN ('MEMBER_CREATED','MEMBER_UPDATED','MEMBER_STATUS_CHANGED');
UPDATE "activity_log" SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('teamId', "entity_public_id"::text)
WHERE "entity_public_id" IS NOT NULL AND action IN ('TEAM_CREATED','TEAM_UPDATED','TEAM_ADMIN_REASSIGNED','MEMBER_ASSIGNED_TO_TEAM','MEMBER_TRANSFERRED');
UPDATE "activity_log" SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('taskId', "entity_public_id"::text)
WHERE "entity_public_id" IS NOT NULL AND action IN ('TASK_CREATED','TASK_ASSIGNED','TASK_STARTED','TASK_ATTACHMENTS_ADDED','TASK_ATTACHMENT_REMOVED','TASK_SUBMITTED','TASK_RESUBMITTED','TASK_APPROVED','TASK_REVISION_REQUESTED');
UPDATE "activity_log" SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reportId', "entity_public_id"::text)
WHERE "entity_public_id" IS NOT NULL AND action IN ('REPORT_CREATED','REPORT_UPDATED','REPORT_SUBMITTED','REPORT_REVIEWED');
UPDATE "activity_log" SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('categoryId', "entity_public_id"::text)
WHERE "entity_public_id" IS NOT NULL AND action IN ('INVENTORY_CATEGORY_CREATED','INVENTORY_CATEGORY_UPDATED');
UPDATE "activity_log" SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('itemId', "entity_public_id"::text)
WHERE "entity_public_id" IS NOT NULL AND action IN ('INVENTORY_CREATED','INVENTORY_UPDATED','INVENTORY_STOCK_IN','INVENTORY_STOCK_OUT','INVENTORY_ADJUSTED','INVENTORY_ASSIGNED','INVENTORY_RETURNED');
