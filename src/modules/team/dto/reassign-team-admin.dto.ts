import { IsString, MinLength } from 'class-validator';

export class ReassignTeamAdminDto {
  @IsString()
  @MinLength(1)
  adminId!: string;
}
