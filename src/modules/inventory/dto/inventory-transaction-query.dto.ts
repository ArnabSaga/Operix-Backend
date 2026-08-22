import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { InventoryTransactionType } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../shared/pagination/pagination.dto.js';
import { trimString } from './shared.js';

export class InventoryTransactionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  teamId?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  itemId?: string;

  @IsOptional()
  @IsEnum(InventoryTransactionType)
  type?: InventoryTransactionType;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  memberId?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  actorId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
