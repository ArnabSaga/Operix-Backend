import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { DashboardTrendDays } from '../dashboard.constant.js';

function parseDays(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return value;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

export class DashboardAiQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseDays(value))
  @IsEnum(DashboardTrendDays)
  days?: DashboardTrendDays;
}
