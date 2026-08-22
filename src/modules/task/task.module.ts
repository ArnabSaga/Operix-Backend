import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { FileStorageModule } from '../../shared/file-storage/file-storage.module.js';
import { MailModule } from '../../shared/mail/mail.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { TaskAttachmentController } from './task-attachment.controller.js';
import { TaskAttachmentService } from './task-attachment.service.js';
import { TaskController } from './task.controller.js';
import { TaskService } from './task.service.js';

@Module({
  imports: [PrismaModule, OperixAuthModule, MailModule, FileStorageModule],
  controllers: [TaskController, TaskAttachmentController],
  providers: [TaskService, TaskAttachmentService],
})
export class TaskModule {}
