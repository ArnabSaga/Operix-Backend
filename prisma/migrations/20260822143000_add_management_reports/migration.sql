-- CreateEnum
CREATE TYPE "ManagementReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ManagementReportReviewAction" AS ENUM ('APPROVE', 'REQUEST_REVISION');

-- CreateTable
CREATE TABLE "management_report" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "operationalSummary" TEXT,
    "completedWorkSummary" TEXT,
    "pendingWorkSummary" TEXT,
    "overdueWorkSummary" TEXT,
    "performanceSummary" TEXT,
    "keyIssues" TEXT,
    "actionsTaken" TEXT,
    "nextPeriodPlan" TEXT,
    "remarks" TEXT,
    "status" "ManagementReportStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "management_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "management_report_version" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "operationalSummary" TEXT NOT NULL,
    "completedWorkSummary" TEXT,
    "pendingWorkSummary" TEXT,
    "overdueWorkSummary" TEXT,
    "performanceSummary" TEXT,
    "keyIssues" TEXT,
    "actionsTaken" TEXT,
    "nextPeriodPlan" TEXT,
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "management_report_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "management_report_review" (
    "id" TEXT NOT NULL,
    "reportVersionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "action" "ManagementReportReviewAction" NOT NULL,
    "feedback" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "management_report_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "management_report_adminId_status_updatedAt_idx" ON "management_report"("adminId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "management_report_teamId_status_updatedAt_idx" ON "management_report"("teamId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "management_report_status_submittedAt_idx" ON "management_report"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "management_report_periodStart_periodEnd_idx" ON "management_report"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "management_report_version_reportId_submittedAt_idx" ON "management_report_version"("reportId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "management_report_version_reportId_version_key" ON "management_report_version"("reportId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "management_report_review_reportVersionId_key" ON "management_report_review"("reportVersionId");

-- CreateIndex
CREATE INDEX "management_report_review_reviewerId_reviewedAt_idx" ON "management_report_review"("reviewerId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "management_report" ADD CONSTRAINT "management_report_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_report" ADD CONSTRAINT "management_report_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_report_version" ADD CONSTRAINT "management_report_version_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "management_report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_report_review" ADD CONSTRAINT "management_report_review_reportVersionId_fkey" FOREIGN KEY ("reportVersionId") REFERENCES "management_report_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_report_review" ADD CONSTRAINT "management_report_review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
