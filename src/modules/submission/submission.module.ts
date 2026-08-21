import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';
import { SubmissionController } from './submission.controller.js';
import { SubmissionService } from './submission.service.js';
import { TaskSubmissionController } from './task-submission.controller.js';

@Module({
  imports: [PrismaModule, OperixAuthModule],
  controllers: [
    TaskSubmissionController,
    SubmissionController,
    ReviewController,
  ],
  providers: [SubmissionService, ReviewService],
})
export class SubmissionModule {}
