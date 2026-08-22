import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

function normalizeFormat(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class ExportFormatQueryDto {
  @IsOptional()
  @Transform(({ value }) => normalizeFormat(value))
  @IsString()
  format?: string;
}
