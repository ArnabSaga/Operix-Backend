import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  TaskPriority,
  TaskRecurrenceFrequency,
  TaskScope,
  TaskStatus,
} from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../shared/pagination/pagination.dto.js';
import { TaskSort } from '../task.constant.js';

export class ListTaskQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TaskScope)
  scope?: TaskScope;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  @MinLength(1)
  teamId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  responsibleUserId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  recurrenceId?: string;

  @IsOptional()
  @IsEnum(TaskRecurrenceFrequency)
  recurrenceFrequency?: TaskRecurrenceFrequency;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return value;
  })
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(TaskSort)
  sort?: TaskSort;
}
