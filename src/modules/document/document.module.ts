import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AiModule } from '../../shared/ai/ai.module.js';
import { DocumentTextModule } from '../../shared/document-text/document-text.module.js';
import { FileStorageModule } from '../../shared/file-storage/file-storage.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { DocumentAiController } from './document-ai.controller.js';
import { DocumentAiService } from './document-ai.service.js';
import { DocumentController } from './document.controller.js';
import { DocumentService } from './document.service.js';

@Module({
  imports: [
    PrismaModule,
    OperixAuthModule,
    FileStorageModule,
    AiModule,
    DocumentTextModule,
  ],
  controllers: [DocumentController, DocumentAiController],
  providers: [DocumentService, DocumentAiService],
  exports: [DocumentService],
})
export class DocumentModule {}
