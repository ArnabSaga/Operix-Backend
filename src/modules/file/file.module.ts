import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { FileStorageModule } from '../../shared/file-storage/file-storage.module.js';
import { OperixAuthModule } from '../auth/auth.module.js';
import { FileController } from './file.controller.js';
import { FileService } from './file.service.js';

@Module({
  imports: [PrismaModule, OperixAuthModule, FileStorageModule],
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}
