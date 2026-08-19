import { IsEnum } from 'class-validator';
import { UserStatus } from '../../../../../generated/prisma/enums.js';

export class UpdateAdminStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
