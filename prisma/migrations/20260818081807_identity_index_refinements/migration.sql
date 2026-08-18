-- CreateIndex
CREATE INDEX "team_adminId_idx" ON "team"("adminId");

-- CreateIndex
CREATE INDEX "team_member_teamId_idx" ON "team_member"("teamId");
