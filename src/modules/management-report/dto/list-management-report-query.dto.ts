import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ManagementReportStatus } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../shared/pagination/pagination.dto.js';
import { MANAGEMENT_REPORT_VALIDATION } from '../management-report.constant.js';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListManagementReportQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ManagementReportStatus)
  status?: ManagementReportStatus;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  teamId?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  adminId?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.SEARCH_MAX_LENGTH)
  q?: string;
}
