CREATE TYPE "RegistrationRequestStatus" AS ENUM ('PENDING', 'APPROVING', 'APPROVED', 'REJECTED');

CREATE TABLE "registration_request" (
    "id" TEXT NOT NULL,
    "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvalClaimId" UUID,
    "approvalClaimedAt" TIMESTAMP(3),
    "selectedRole" "UserRole",
    "selectedEmployeeId" TEXT,
    "selectedDesignation" TEXT,
    "selectedTeamId" TEXT,
    "reviewerId" TEXT,
    "rejectionCode" TEXT,
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "passwordConfiguredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "registration_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "registration_throttle_bucket" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "hourBucketStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "registration_throttle_bucket_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user" ADD COLUMN "registrationRequestId" TEXT;
ALTER TABLE "user" ADD COLUMN "passwordSetupRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "registration_request_public_id_key" ON "registration_request"("public_id");
CREATE INDEX "registration_request_status_createdAt_idx" ON "registration_request"("status", "createdAt");
CREATE INDEX "registration_request_normalizedEmail_createdAt_idx" ON "registration_request"("normalizedEmail", "createdAt");
CREATE INDEX "registration_request_approvalClaimedAt_idx" ON "registration_request"("approvalClaimedAt");
CREATE INDEX "registration_request_reviewerId_idx" ON "registration_request"("reviewerId");
CREATE INDEX "registration_request_selectedTeamId_idx" ON "registration_request"("selectedTeamId");
CREATE UNIQUE INDEX "registration_request_active_email_key" ON "registration_request"("normalizedEmail") WHERE "status" IN ('PENDING', 'APPROVING');
CREATE UNIQUE INDEX "registration_throttle_bucket_ipHash_hourBucketStart_key" ON "registration_throttle_bucket"("ipHash", "hourBucketStart");
CREATE INDEX "registration_throttle_bucket_expiresAt_idx" ON "registration_throttle_bucket"("expiresAt");
CREATE UNIQUE INDEX "user_registrationRequestId_key" ON "user"("registrationRequestId");

ALTER TABLE "registration_request" ADD CONSTRAINT "registration_request_selectedTeamId_fkey" FOREIGN KEY ("selectedTeamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_request" ADD CONSTRAINT "registration_request_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user" ADD CONSTRAINT "user_registrationRequestId_fkey" FOREIGN KEY ("registrationRequestId") REFERENCES "registration_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "registration_throttle_bucket" ADD CONSTRAINT "registration_throttle_bucket_count_check" CHECK ("count" > 0);
