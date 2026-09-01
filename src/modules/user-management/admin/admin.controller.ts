import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';
import { PublicIdPipe } from '../../../shared/identity/public-id.pipe.js';
import { PaginationQueryDto } from '../../../shared/pagination/pagination.dto.js';
import { AdminService } from './admin.service.js';
import { CreateAdminDto } from './dto/create-admin.dto.js';
import { UpdateAdminDto } from './dto/update-admin.dto.js';
import { UpdateAdminStatusDto } from './dto/update-admin-status.dto.js';

@ApiTags('admins')
@Controller('admins')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
@RequireRoles(UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  createAdmin(
    @CurrentViewer() viewer: OperixViewer,
    @Body() dto: CreateAdminDto,
  ) {
    return this.adminService.createAdmin(viewer, dto);
  }

  @Get()
  listAdmins(@Query() query: PaginationQueryDto) {
    return this.adminService.listAdmins(query);
  }

  @Get(':adminId')
  getAdmin(@Param('adminId', PublicIdPipe) adminId: string) {
    return this.adminService.getAdmin(adminId);
  }

  @Patch(':adminId')
  updateAdmin(
    @CurrentViewer() viewer: OperixViewer,
    @Param('adminId', PublicIdPipe) adminId: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.adminService.updateAdmin(viewer, adminId, dto);
  }

  @Patch(':adminId/status')
  updateAdminStatus(
    @CurrentViewer() viewer: OperixViewer,
    @Param('adminId', PublicIdPipe) adminId: string,
    @Body() dto: UpdateAdminStatusDto,
  ) {
    return this.adminService.updateAdminStatus(viewer, adminId, dto);
  }
}
