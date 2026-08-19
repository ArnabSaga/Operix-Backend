import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../../generated/prisma/enums.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import { OPERIX_REQUIRED_ROLES_METADATA_KEY } from './auth-metadata.constant.js';
import type { OperixRequest } from './operix-request.interface.js';

@Injectable()
export class OperixRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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

    const requiredRoles =
      this.reflector.getAllAndOverride<UserRole[]>(
        OPERIX_REQUIRED_ROLES_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (requiredRoles.length === 0 || requiredRoles.includes(viewer.role)) {
      return true;
    }

    throw new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'You do not have access to this resource.',
    );
  }
}
