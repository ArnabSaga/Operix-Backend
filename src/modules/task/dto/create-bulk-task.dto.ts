import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  TaskBatchScope,
  TaskPriority,
  TaskRecurrenceFrequency,
} from '../../../../generated/prisma/enums.js';

export class CreateBulkTaskRecurrenceDto {
  @IsEnum(TaskRecurrenceFrequency)
  frequency!: TaskRecurrenceFrequency;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_080)
  reminderLeadMinutes?: number;
}

export class CreateBulkTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  remarks?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @Type(() => Date)
  @IsDate()
  dueAt!: Date;

  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string;

  @IsEnum(TaskBatchScope)
  scope!: TaskBatchScope;

  @IsOptional()
  @IsString()
  @MinLength(1)
  teamId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBulkTaskRecurrenceDto)
  recurrence?: CreateBulkTaskRecurrenceDto;
}
