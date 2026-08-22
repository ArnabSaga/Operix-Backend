import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import { FILE_STORAGE_ADAPTER } from './file-storage.constant.js';
import type {
  FileStorageAdapter,
  StorageDownload,
  UploadedStoredFile,
  ValidatedUploadFile,
} from './file-storage.interface.js';
import { validateUploadFiles } from './file-validation.js';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  constructor(
    private readonly configService: ConfigService<
      ApplicationConfiguration,
      true
    >,
    @Inject(FILE_STORAGE_ADAPTER)
    private readonly adapter: FileStorageAdapter,
  ) {}

  isEnabled(): boolean {
    return this.configService.get('fileStorage', { infer: true }).enabled;
  }

  assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.FILE_STORAGE_UNAVAILABLE,
        'File storage is unavailable.',
      );
    }
  }

  async validateFiles(
    files: Express.Multer.File[] | undefined,
    options: { requireAtLeastOne: boolean },
  ): Promise<ValidatedUploadFile[]> {
    return validateUploadFiles(files, options);
  }

  async uploadValidatedFiles(
    files: ValidatedUploadFile[],
    folder: string,
  ): Promise<UploadedStoredFile[]> {
    this.assertEnabled();

    const uploaded: UploadedStoredFile[] = [];

    try {
      for (const file of files) {
        const stored = await this.adapter.upload({ file, folder });
        uploaded.push({
          ...file,
          storageKey: stored.storageKey,
        });
      }
    } catch {
      await this.destroyUploadedBestEffort(uploaded, 'partial upload cleanup');
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.FILE_STORAGE_UNAVAILABLE,
        'File storage is unavailable.',
      );
    }

    return uploaded;
  }

  async destroy(storageKey: string): Promise<void> {
    this.assertEnabled();
    await this.adapter.destroy(storageKey);
  }

  async destroyUploadedBestEffort(
    files: { storageKey: string }[],
    context: string,
  ): Promise<void> {
    for (const file of files) {
      try {
        await this.adapter.destroy(file.storageKey);
      } catch (error) {
        this.logger.warn(
          `File cleanup failed during ${context}: ${getErrorMessage(error)}`,
        );
      }
    }
  }

  async download(storageKey: string): Promise<StorageDownload> {
    this.assertEnabled();

    try {
      return await this.adapter.download(storageKey);
    } catch {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.FILE_STORAGE_UNAVAILABLE,
        'File storage is unavailable.',
      );
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown storage error';
}
