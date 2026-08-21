import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { TaskReviewAction } from '../../../../generated/prisma/enums.js';

export class CreateReviewDto {
  @IsEnum(TaskReviewAction)
  action!: TaskReviewAction;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: CreateReviewDto, value: unknown) =>
      dto.action === TaskReviewAction.REQUEST_REVISION || value !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  feedback?: string;
}
