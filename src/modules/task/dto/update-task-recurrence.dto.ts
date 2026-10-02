import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateTaskRecurrenceDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  responsibleUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_080)
  reminderLeadMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_080)
  distributionLeadMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
