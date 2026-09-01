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

export interface SafeSubmissionAttachmentResponse {
  file: SafeFileResponse;
  downloadUrl: string;
}

export interface SafeFileSource {
  id: string;
  publicId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedBy: { publicId: string };
  createdAt: Date;
}

export interface SafeAttachmentSource {
  id: string;
  publicId?: string;
  file: SafeFileSource;
}
