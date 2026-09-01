import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import type { Response } from 'express';
import { UserRole } from '../../../generated/prisma/enums.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { CurrentViewer } from '../../shared/auth/current-viewer.decorator.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { RequireRoles } from '../../shared/auth/require-roles.decorator.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { PublicIdPipe } from '../../shared/identity/public-id.pipe.js';
import { ApproveRegistrationRequestDto } from './dto/approve-registration-request.dto.js';
import { CreateRegistrationRequestDto } from './dto/create-registration-request.dto.js';
import { RegistrationRequestQueryDto } from './dto/registration-request-query.dto.js';
import { RejectRegistrationRequestDto } from './dto/reject-registration-request.dto.js';
import { getTrustedClientIp } from './trusted-client-ip.js';
import { RegistrationService } from './registration.service.js';

@ApiTags('registration-requests')
@Controller('registration-requests')
export class RegistrationController {
  constructor(private readonly service: RegistrationService) {}

  @Post()
  @AllowAnonymous()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @Body() dto: CreateRegistrationRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.service.createPublicRequest(
        dto,
        getTrustedClientIp(request),
      );
    } catch (error) {
      if (error instanceof AppException) {
        const body = error.getResponse();
        if (typeof body === 'object' && body !== null && 'details' in body) {
          const details = body.details as { retryAfter?: unknown } | null;
          if (typeof details?.retryAfter === 'number')
            response.setHeader('Retry-After', String(details.retryAfter));
        }
      }
      throw error;
    }
  }

  @Get()
  @UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
  @RequireRoles(UserRole.SUPER_ADMIN)
  list(@Query() query: RegistrationRequestQueryDto) {
    return this.service.list(query);
  }

  @Get(':requestId')
  @UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
  @RequireRoles(UserRole.SUPER_ADMIN)
  get(@Param('requestId', PublicIdPipe) requestId: string) {
    return this.service.get(requestId);
  }

  @Post(':requestId/approve')
  @UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
  @RequireRoles(UserRole.SUPER_ADMIN)
  approve(
    @CurrentViewer() viewer: OperixViewer,
    @Param('requestId', PublicIdPipe) requestId: string,
    @Body() dto: ApproveRegistrationRequestDto,
  ) {
    return this.service.approve(viewer, requestId, dto);
  }

  @Post(':requestId/reject')
  @UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
  @RequireRoles(UserRole.SUPER_ADMIN)
  reject(
    @CurrentViewer() viewer: OperixViewer,
    @Param('requestId', PublicIdPipe) requestId: string,
    @Body() dto: RejectRegistrationRequestDto,
  ) {
    return this.service.reject(viewer, requestId, dto);
  }

  @Post(':requestId/resend-setup')
  @UseGuards(ViewerContextGuard, AccountStatusGuard, OperixRoleGuard)
  @RequireRoles(UserRole.SUPER_ADMIN)
  resend(
    @CurrentViewer() viewer: OperixViewer,
    @Param('requestId', PublicIdPipe) requestId: string,
  ) {
    return this.service.resendSetup(viewer, requestId);
  }
}

@ApiTags('internal')
@Controller('internal/cron')
export class RegistrationCronController {
  constructor(private readonly service: RegistrationService) {}

  @Get('registration-cleanup')
  @AllowAnonymous()
  cleanup(@Headers('authorization') authorization?: string) {
    if (!this.service.isValidCronAuthorization(authorization)) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'CRON_AUTH_REQUIRED',
        'Authentication required.',
      );
    }
    return this.service.cleanup();
  }
}
