import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { UserStatus } from '../../../generated/prisma/enums.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import type { OperixRequest } from './operix-request.interface.js';

@Injectable()
export class AccountStatusGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<OperixRequest>();
    const viewer = request.operixViewer;

    if (!viewer) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        APP_ERROR_CODE.AUTH_REQUIRED,
        'Authentication required.',
      );
    }

    if (viewer.status === UserStatus.ACTIVE) {
      return true;
    }

    if (viewer.status === UserStatus.INACTIVE) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.ACCOUNT_INACTIVE,
        'This account is inactive.',
      );
    }

    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.ACCOUNT_SUSPENDED,
      'This account is suspended.',
    );
  }
}
