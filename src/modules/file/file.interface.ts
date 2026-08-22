import type { FileAsset } from '../../../generated/prisma/client.js';

export interface SafeFileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  createdAt: Date;
}

export interface SafeAttachmentResponse {
  id: string;
  file: SafeFileResponse;
  downloadUrl: string;
}

export type SafeFileSource = Pick<
  FileAsset,
  | 'id'
  | 'originalName'
  | 'mimeType'
  | 'sizeBytes'
  | 'uploadedById'
  | 'createdAt'
>;

export interface SafeAttachmentSource {
  id: string;
  file: SafeFileSource;
}
