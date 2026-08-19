import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  employeeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string | null;
}
