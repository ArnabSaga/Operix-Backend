import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { INVENTORY_VALIDATION } from '../inventory.constant.js';
import { optionalTrimString } from './shared.js';

export class StockInDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Transform(({ value }) => optionalTrimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(INVENTORY_VALIDATION.NOTE_MAX_LENGTH)
  note?: string;
}
