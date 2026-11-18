import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TaskPriority } from '../../../../generated/prisma/enums.js';

function trimOptionalString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateTaskDto {
  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MaxLength(5_000)
  description?: string | null;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MaxLength(2_000)
  remarks?: string | null;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date | null;

  @IsOptional()
  @Transform(trimOptionalString)
  @IsString()
  @MinLength(1)
  categoryId?: string | null;
}
