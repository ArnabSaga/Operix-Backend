import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { INVENTORY_VALIDATION } from '../inventory.constant.js';
import { optionalTrimString, trimString } from './shared.js';

export class StockOutDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  memberId?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(INVENTORY_VALIDATION.REASON_MAX_LENGTH)
  reason!: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(INVENTORY_VALIDATION.NOTE_MAX_LENGTH)
  note?: string;
}
