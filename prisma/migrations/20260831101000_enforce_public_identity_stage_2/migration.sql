-- Stage 2 enforces the required public identity invariant after Stage 1 backfill.
ALTER TABLE "user" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "team" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "task_category" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "task" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "task_submission" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "file_asset" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "task_attachment" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "notification" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "activity_log" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "management_report" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "inventory_category" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "inventory_item" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "inventory_assignment" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "inventory_transaction" ALTER COLUMN "public_id" SET NOT NULL;

