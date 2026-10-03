import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { DocumentService } from './document.service.js';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto.js';

@ApiTags('documents')
@Controller('documents')
@UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  @RequireRoles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  listDocuments(
    @CurrentViewer() viewer: OperixViewer,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documentService.listDocuments(viewer, query);
  }
}
