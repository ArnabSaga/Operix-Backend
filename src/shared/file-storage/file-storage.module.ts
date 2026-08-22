import { Module } from '@nestjs/common';
import { CloudinaryStorageAdapter } from './adapters/cloudinary-storage.adapter.js';
import { FILE_STORAGE_ADAPTER } from './file-storage.constant.js';
import { FileStorageService } from './file-storage.service.js';

@Module({
  providers: [
    FileStorageService,
    CloudinaryStorageAdapter,
    {
      provide: FILE_STORAGE_ADAPTER,
      useExisting: CloudinaryStorageAdapter,
    },
  ],
  exports: [FileStorageService],
})
export class FileStorageModule {}
