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
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { PublicIdPipe } from '../../shared/identity/public-id.pipe.js';
import { PaginationQueryDto } from '../../shared/pagination/pagination.dto.js';
import { AssignMemberDto } from './dto/assign-member.dto.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { ReassignTeamAdminDto } from './dto/reassign-team-admin.dto.js';
import { UpdateTeamDto } from './dto/update-team.dto.js';
import { TeamService } from './team.service.js';

@ApiTags('teams')
@Controller('teams')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  @RequireRoles(UserRole.SUPER_ADMIN)
  createTeam(
    @CurrentViewer() viewer: OperixViewer,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamService.createTeam(viewer, dto);
  }

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listTeams(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: PaginationQueryDto,
  ) {
    return this.teamService.listTeams(viewer, query);
  }

  @Get(':teamId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getTeam(
    @CurrentViewer() viewer: OperixViewer,
    @Param('teamId', PublicIdPipe) teamId: string,
  ) {
    return this.teamService.getTeam(viewer, teamId);
  }

  @Patch(':teamId')
  @RequireRoles(UserRole.SUPER_ADMIN)
  updateTeam(
    @CurrentViewer() viewer: OperixViewer,
    @Param('teamId', PublicIdPipe) teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamService.updateTeam(viewer, teamId, dto);
  }

  @Post(':teamId/reassign-admin')
  @RequireRoles(UserRole.SUPER_ADMIN)
  reassignTeamAdmin(
    @CurrentViewer() viewer: OperixViewer,
    @Param('teamId', PublicIdPipe) teamId: string,
    @Body() dto: ReassignTeamAdminDto,
  ) {
    return this.teamService.reassignTeamAdmin(viewer, teamId, dto);
  }

  @Post(':teamId/members')
  @RequireRoles(UserRole.SUPER_ADMIN)
  assignMember(
    @CurrentViewer() viewer: OperixViewer,
    @Param('teamId', PublicIdPipe) teamId: string,
    @Body() dto: AssignMemberDto,
  ) {
    return this.teamService.assignMember(viewer, teamId, dto);
  }
}
