import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AiModule } from '../../shared/ai/ai.module.js';
import { DocumentTextModule } from '../../shared/document-text/document-text.module.js';
import { FileStorageModule } from '../../shared/file-storage/file-storage.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';
import { SubmissionAiController } from './submission-ai.controller.js';
import { SubmissionAiService } from './submission-ai.service.js';
import { SubmissionAttachmentController } from './submission-attachment.controller.js';
import { SubmissionController } from './submission.controller.js';
import { SubmissionService } from './submission.service.js';
import { TaskSubmissionController } from './task-submission.controller.js';

@Module({
  imports: [
    PrismaModule,
    OperixAuthModule,
    FileStorageModule,
    DocumentTextModule,
    AiModule,
  ],
  controllers: [
    TaskSubmissionController,
    SubmissionController,
    SubmissionAttachmentController,
    ReviewController,
    SubmissionAiController,
  ],
  providers: [SubmissionService, ReviewService, SubmissionAiService],
})
export class SubmissionModule {}
