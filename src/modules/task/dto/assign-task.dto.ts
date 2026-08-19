import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AssignTaskDto {
  @IsString()
  @MinLength(1)
  memberId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  note?: string;
}
