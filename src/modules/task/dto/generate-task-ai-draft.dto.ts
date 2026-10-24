import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The only input a client may send. Model, provider, temperature, system
 * prompt and credentials are server-owned; the global `ValidationPipe` runs
 * with `forbidNonWhitelisted`, so any extra property is rejected with 400.
 */
export class GenerateTaskAiDraftDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @MinLength(10)
  @MaxLength(4_000)
  prompt!: string;
}
