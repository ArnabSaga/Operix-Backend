import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination.dto.js';
import { NOTIFICATION_FILTER } from '../notification.constant.js';

function parseStrictBoolean(value: unknown): unknown {
  if (value === 'true' || value === true) {
    return true;
  }

  if (value === 'false' || value === false) {
    return false;
  }

  return value;
}

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListNotificationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseStrictBoolean(value))
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTIFICATION_FILTER.TYPE_MAX_LENGTH)
  type?: string;
}
