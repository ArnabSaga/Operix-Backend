import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination.dto.js';
import { ACTIVITY_FILTER } from '../activity.constant.js';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListActivityQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(ACTIVITY_FILTER.ACTION_MAX_LENGTH)
  action?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(ACTIVITY_FILTER.ENTITY_TYPE_MAX_LENGTH)
  entityType?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  actorId?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  from?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  to?: string;
}
