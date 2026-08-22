import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  InventoryAdjustmentDirection,
  INVENTORY_VALIDATION,
} from '../inventory.constant.js';
import { optionalTrimString, trimString } from './shared.js';

export class InventoryAdjustmentDto {
  @IsEnum(InventoryAdjustmentDirection)
  direction!: InventoryAdjustmentDirection;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

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
