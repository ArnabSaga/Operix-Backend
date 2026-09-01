import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { RegistrationRequestStatus } from '../../../../generated/prisma/enums.js';

export class RegistrationRequestQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsEnum(RegistrationRequestStatus)
  status?: RegistrationRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  q?: string;
}
