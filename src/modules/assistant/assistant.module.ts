import { Module } from '@nestjs/common';
import { AiModule } from '../../shared/ai/ai.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { TaskModule } from '../task/task.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  imports: [OperixAuthModule, AiModule, TaskModule, DashboardModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
