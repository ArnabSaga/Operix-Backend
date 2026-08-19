import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { OperixAuth } from './auth.factory.js';
import { OperixAuthService } from './auth.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';

@ApiTags('auth')
@Controller('auth')
export class OperixAuthController {
  constructor(private readonly authService: OperixAuthService) {}

  @Get('me')
  @ApiOkResponse({ description: 'Returns the current Operix viewer context.' })
  getMe(@Session() session: UserSession<OperixAuth>): Promise<OperixViewer> {
    return this.authService.getViewer(session.user.id);
  }
}
