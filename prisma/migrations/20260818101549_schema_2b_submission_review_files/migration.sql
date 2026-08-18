-- CreateEnum
CREATE TYPE "TaskReviewAction" AS ENUM ('APPROVE', 'REQUEST_REVISION');

-- CreateTable
CREATE TABLE "file_asset" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_attachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_submission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "submissionText" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_review" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "action" "TaskReviewAction" NOT NULL,
    "feedback" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_asset_storageKey_key" ON "file_asset"("storageKey");

-- CreateIndex
CREATE INDEX "file_asset_uploadedById_idx" ON "file_asset"("uploadedById");

-- CreateIndex
CREATE INDEX "submission_attachment_fileId_idx" ON "submission_attachment"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "submission_attachment_submissionId_fileId_key" ON "submission_attachment"("submissionId", "fileId");

-- CreateIndex
CREATE INDEX "task_attachment_fileId_idx" ON "task_attachment"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "task_attachment_taskId_fileId_key" ON "task_attachment"("taskId", "fileId");

-- CreateIndex
CREATE INDEX "task_submission_submittedById_idx" ON "task_submission"("submittedById");

-- CreateIndex
CREATE UNIQUE INDEX "task_submission_taskId_version_key" ON "task_submission"("taskId", "version");

-- CreateIndex
CREATE INDEX "task_review_submissionId_reviewedAt_idx" ON "task_review"("submissionId", "reviewedAt");

-- CreateIndex
CREATE INDEX "task_review_reviewerId_idx" ON "task_review"("reviewerId");

-- AddForeignKey
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachment" ADD CONSTRAINT "submission_attachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "task_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachment" ADD CONSTRAINT "submission_attachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachment" ADD CONSTRAINT "task_attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachment" ADD CONSTRAINT "task_attachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission" ADD CONSTRAINT "task_submission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission" ADD CONSTRAINT "task_submission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_review" ADD CONSTRAINT "task_review_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "task_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_review" ADD CONSTRAINT "task_review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
