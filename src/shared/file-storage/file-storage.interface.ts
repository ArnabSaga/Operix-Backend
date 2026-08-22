import type { Readable } from 'node:stream';

export interface ValidatedUploadFile {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

export interface StoredFile {
  storageKey: string;
}

export interface UploadedStoredFile extends ValidatedUploadFile, StoredFile {}

export interface StorageUploadInput {
  file: ValidatedUploadFile;
  folder: string;
}

export interface StorageDownload {
  stream: Readable;
}

export interface FileStorageAdapter {
  upload(input: StorageUploadInput): Promise<StoredFile>;
  destroy(storageKey: string): Promise<void>;
  download(storageKey: string): Promise<StorageDownload>;
}
