import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { TeamModule } from '../team/team.module.js';
import { AccountProvisioningService } from './account-provisioning.service.js';
import { AdminController } from './admin/admin.controller.js';
import { AdminService } from './admin/admin.service.js';
import { MemberController } from './member/member.controller.js';
import { MemberService } from './member/member.service.js';

@Module({
  imports: [PrismaModule, TeamModule],
  controllers: [AdminController, MemberController],
  providers: [AccountProvisioningService, AdminService, MemberService],
})
export class UserManagementModule {}
