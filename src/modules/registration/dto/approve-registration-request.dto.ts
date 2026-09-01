import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { UserRole } from '../../../../generated/prisma/enums.js';

export class ApproveRegistrationRequestDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @Transform(({ value }) => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @MaxLength(100)
  employeeId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @MaxLength(200)
  designation?: string;

  @IsOptional()
  @IsUUID('4')
  teamId?: string;
}
