import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { TaskController } from './task.controller.js';
import { TaskService } from './task.service.js';

@Module({
  imports: [PrismaModule, OperixAuthModule],
  controllers: [TaskController],
  providers: [TaskService],
})
export class TaskModule {}
