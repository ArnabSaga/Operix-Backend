import type { Prisma } from '../../../generated/prisma/client.js';
import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';
import { DocumentSource } from './document.constant.js';
import type { documentSelect } from './document.select.js';

export type DocumentSourceType =
  DocumentSource.TASK_ATTACHMENT | DocumentSource.SUBMISSION_ATTACHMENT;

export interface DocumentListItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedBy: {
    id: string;
    name: string;
  };
  source: {
    type: DocumentSourceType;
    task: {
      id: string;
      title: string;
    } | null;
    submission: {
      id: string;
      version: number;
    } | null;
  };
  downloadUrl: string;
}

export interface PaginatedDocumentResponse {
  data: DocumentListItem[];
  meta: PaginationMeta;
}

export type DocumentResponseSource = Prisma.FileAssetGetPayload<{
  select: typeof documentSelect;
}>;
