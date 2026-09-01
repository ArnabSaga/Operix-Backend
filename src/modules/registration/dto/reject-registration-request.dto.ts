import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectRegistrationRequestDto {
  @Transform(({ value }) => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
