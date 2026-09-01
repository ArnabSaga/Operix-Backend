import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import type { PublicId } from './identity.type.js';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPublicId(value: unknown): value is PublicId {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

@Injectable()
export class PublicIdPipe implements PipeTransform<string, PublicId> {
  transform(value: string): PublicId {
    if (!isPublicId(value)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        APP_ERROR_CODE.VALIDATION_ERROR,
        'The resource identifier must be a UUID v4.',
      );
    }

    return value;
  }
}
