import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { INVENTORY_VALIDATION } from '../inventory.constant.js';
import { optionalTrimString, trimString } from './shared.js';

export class CreateInventoryCategoryDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(INVENTORY_VALIDATION.NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => optionalTrimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(INVENTORY_VALIDATION.DESCRIPTION_MAX_LENGTH)
  description?: string;
}
