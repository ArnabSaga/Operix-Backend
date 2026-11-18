import { IsEnum, IsOptional } from 'class-validator';
import {
  DASHBOARD_AI_PERIOD,
  type DashboardAiPeriod,
} from '../dashboard-ai.constant.js';

export class DashboardAiQueryDto {
  @IsOptional()
  @IsEnum(DASHBOARD_AI_PERIOD)
  period?: DashboardAiPeriod;
}
