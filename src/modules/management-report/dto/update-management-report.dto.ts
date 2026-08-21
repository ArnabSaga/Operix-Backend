import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MANAGEMENT_REPORT_VALIDATION } from '../management-report.constant.js';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateManagementReportDto {
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodEnd?: Date;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  operationalSummary?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  completedWorkSummary?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  pendingWorkSummary?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  overdueWorkSummary?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  performanceSummary?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  keyIssues?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  actionsTaken?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  nextPeriodPlan?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.REMARKS_MAX_LENGTH)
  remarks?: string | null;
}
