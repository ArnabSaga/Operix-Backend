import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRegistrationRequestDto {
  @Transform(({ value }) => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Transform(({ value }) => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim().toLowerCase() : input;
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
