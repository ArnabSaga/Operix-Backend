import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import type { OperixAuth } from './auth.factory.js';
import { OperixAuthService } from './auth.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';

@ApiTags('viewer')
@Controller('viewer')
export class OperixAuthController {
  constructor(private readonly authService: OperixAuthService) {}

  @Get('me')
  @ApiOkResponse({ description: 'Returns the current Operix viewer context.' })
  getMe(
    @Session() session: UserSession<OperixAuth> | null,
  ): Promise<OperixViewer> {
    const userId = session?.user?.id;

    if (!userId) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        APP_ERROR_CODE.AUTH_REQUIRED,
        'Authentication required.',
      );
    }

    return this.authService.getViewer(userId);
  }
}
