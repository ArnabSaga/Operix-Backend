import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { DashboardTrendDays } from '../../dashboard/dashboard.constant.js';
import { ExportFormatQueryDto } from './export-format-query.dto.js';

function parseTrendDays(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return value;
  }

  const numeric = Number(value);

  return Number.isNaN(numeric) ? value : numeric;
}

export class ExportDashboardTrendQueryDto extends ExportFormatQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseTrendDays(value))
  @IsEnum(DashboardTrendDays)
  days?: DashboardTrendDays;
}
