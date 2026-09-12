import { IsBoolean } from 'class-validator';

export class UpdateTaskSelfClaimDto {
  @IsBoolean()
  enabled!: boolean;
}
