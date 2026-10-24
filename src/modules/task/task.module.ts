import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AiModule } from '../../shared/ai/ai.module.js';
import { FileStorageModule } from '../../shared/file-storage/file-storage.module.js';
import { MailModule } from '../../shared/mail/mail.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { TaskAttachmentController } from './task-attachment.controller.js';
import { TaskAttachmentService } from './task-attachment.service.js';
import { TaskController } from './task.controller.js';
import { TaskAiController } from './task-ai.controller.js';
import { TaskAiService } from './task-ai.service.js';
import { TaskAutomationController } from './task-automation.controller.js';
import { TaskAutomationService } from './task-automation.service.js';
import { TaskRecurrenceController } from './task-recurrence.controller.js';
import { TaskRecurrenceService } from './task-recurrence.service.js';
import { TaskService } from './task.service.js';
import { TaskDistributionService } from './task-distribution.service.js';
import { TaskAssignmentAiController } from './task-assignment-ai.controller.js';
import { TaskAssignmentAiService } from './task-assignment-ai.service.js';

@Module({
  imports: [
    PrismaModule,
    OperixAuthModule,
    MailModule,
    FileStorageModule,
    AiModule,
  ],
  controllers: [
    TaskController,
    TaskAttachmentController,
    TaskRecurrenceController,
    TaskAutomationController,
    TaskAiController,
    TaskAssignmentAiController,
  ],
  providers: [
    TaskService,
    TaskAttachmentService,
    TaskRecurrenceService,
    TaskAutomationService,
    TaskDistributionService,
    TaskAiService,
    TaskAssignmentAiService,
  ],
  exports: [TaskService],
})
export class TaskModule {}
