import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ManagementReportStatus } from '../../../../generated/prisma/enums.js';
import { MANAGEMENT_REPORT_VALIDATION } from '../../management-report/management-report.constant.js';
import { ExportFormatQueryDto } from './export-format-query.dto.js';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ExportManagementReportQueryDto extends ExportFormatQueryDto {
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
