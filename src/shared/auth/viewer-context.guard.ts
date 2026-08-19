import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { OperixAuthService } from '../../modules/auth/auth.service.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import type { OperixRequest } from './operix-request.interface.js';

@Injectable()
export class ViewerContextGuard implements CanActivate {
  constructor(private readonly authService: OperixAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OperixRequest>();
    const userId = request.user?.id;

    if (!userId) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        APP_ERROR_CODE.AUTH_REQUIRED,
        'Authentication required.',
      );
    }

    request.operixViewer = await this.authService.getViewer(userId);

    return true;
  }
}
