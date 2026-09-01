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
import { CreateMemberDto } from './dto/create-member.dto.js';
import { TransferMemberDto } from './dto/transfer-member.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { UpdateMemberStatusDto } from './dto/update-member-status.dto.js';
import { MemberService } from './member.service.js';

@ApiTags('members')
@Controller('members')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Post()
  @RequireRoles(UserRole.SUPER_ADMIN)
  createMember(
    @CurrentViewer() viewer: OperixViewer,
    @Body() dto: CreateMemberDto,
  ) {
    return this.memberService.createMember(viewer, dto);
  }

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  listMembers(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: PaginationQueryDto,
  ) {
    return this.memberService.listMembers(viewer, query);
  }

  @Get(':memberId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getMember(
    @CurrentViewer() viewer: OperixViewer,
    @Param('memberId', PublicIdPipe) memberId: string,
  ) {
    return this.memberService.getMember(viewer, memberId);
  }

  @Patch(':memberId')
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateMember(
    @CurrentViewer() viewer: OperixViewer,
    @Param('memberId', PublicIdPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.memberService.updateMember(viewer, memberId, dto);
  }

  @Patch(':memberId/status')
  @RequireRoles(UserRole.SUPER_ADMIN)
  updateMemberStatus(
    @CurrentViewer() viewer: OperixViewer,
    @Param('memberId', PublicIdPipe) memberId: string,
    @Body() dto: UpdateMemberStatusDto,
  ) {
    return this.memberService.updateMemberStatus(viewer, memberId, dto);
  }

  @Post(':memberId/transfer')
  @RequireRoles(UserRole.SUPER_ADMIN)
  transferMember(
    @CurrentViewer() viewer: OperixViewer,
    @Param('memberId', PublicIdPipe) memberId: string,
    @Body() dto: TransferMemberDto,
  ) {
    return this.memberService.transferMember(viewer, memberId, dto);
  }
}
