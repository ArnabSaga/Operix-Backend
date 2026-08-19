import { IsString, MinLength } from 'class-validator';

export class AssignMemberDto {
  @IsString()
  @MinLength(1)
  memberId!: string;
}
