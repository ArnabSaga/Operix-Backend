import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { ManagementReportReviewAction } from '../../../../generated/prisma/enums.js';

export class ReviewManagementReportDto {
  @IsEnum(ManagementReportReviewAction)
  action!: ManagementReportReviewAction;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(
    (dto: ReviewManagementReportDto, value: unknown) =>
      dto.action === ManagementReportReviewAction.REQUEST_REVISION ||
      value !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  feedback?: string;
}
