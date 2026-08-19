import { IsString, MinLength } from 'class-validator';

export class TransferMemberDto {
  @IsString()
  @MinLength(1)
  targetTeamId!: string;
}
