import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  INITIAL_PASSWORD_MAX_LENGTH,
  INITIAL_PASSWORD_MIN_LENGTH,
} from '../../user-management.constant.js';

export class CreateAdminDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(INITIAL_PASSWORD_MIN_LENGTH)
  @MaxLength(INITIAL_PASSWORD_MAX_LENGTH)
  initialPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;
}
