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

export class CreateManagementReportDto {
  @IsString()
  @MinLength(1)
  teamId!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.TITLE_MAX_LENGTH)
  title!: string;

  @Type(() => Date)
  @IsDate()
  periodStart!: Date;

  @Type(() => Date)
  @IsDate()
  periodEnd!: Date;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  operationalSummary?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  completedWorkSummary?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  pendingWorkSummary?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  overdueWorkSummary?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  performanceSummary?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  keyIssues?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  actionsTaken?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.NARRATIVE_MAX_LENGTH)
  nextPeriodPlan?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_REPORT_VALIDATION.REMARKS_MAX_LENGTH)
  remarks?: string;
}
