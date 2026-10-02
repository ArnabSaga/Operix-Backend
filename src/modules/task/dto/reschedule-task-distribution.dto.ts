import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export class RescheduleTaskDistributionDto {
  @Type(() => Date)
  @IsDate()
  scheduledAt!: Date;
}
