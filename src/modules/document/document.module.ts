import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { DocumentController } from './document.controller.js';
import { DocumentService } from './document.service.js';

@Module({
  imports: [PrismaModule, OperixAuthModule],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
