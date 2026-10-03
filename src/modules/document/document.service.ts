import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import { DocumentSort, DocumentSource } from './document.constant.js';
import type { ListDocumentsQueryDto } from './dto/list-documents-query.dto.js';
import type { PaginatedDocumentResponse } from './document.interface.js';
import { mapDocumentResponse } from './document.mapper.js';
import { documentSelect } from './document.select.js';
import { buildDocumentScopeWhere } from './policies/document-scope.policy.js';

@Injectable()
export class DocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async listDocuments(
    viewer: OperixViewer,
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocumentResponse> {
    const normalized = normalizePagination(query);
    const where: Prisma.FileAssetWhereInput = {
      AND: [buildDocumentScopeWhere(viewer), ...this.buildFilterWheres(query)],
    };
    const [rows, total] = await Promise.all([
      this.prisma.fileAsset.findMany({
        where,
        select: documentSelect,
        orderBy: getDocumentOrderBy(query.sort),
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.fileAsset.count({ where }),
    ]);
    // The scope predicate guarantees at least one source per row; the filter
    // below only defends the response contract if that ever changes.
    const data = rows.flatMap((row) => {
      const mapped = mapDocumentResponse(row);
      return mapped ? [mapped] : [];
    });
    return {
      data,
      meta: createPaginationMeta({ ...normalized, total }),
    };
  }

  /**
   * Optional filters are always intersected with the role scope. Incoming
   * memberId/teamId values are public UUIDs resolved through relations;
   * they are never compared against private FK columns.
   */
  private buildFilterWheres(
    query: ListDocumentsQueryDto,
  ): Prisma.FileAssetWhereInput[] {
    const wheres: Prisma.FileAssetWhereInput[] = [];

    if (query.source === DocumentSource.TASK_ATTACHMENT) {
      wheres.push({
        taskAttachments: { some: {} },
        submissionAttachments: { none: {} },
      });
    } else if (query.source === DocumentSource.SUBMISSION_ATTACHMENT) {
      wheres.push({ submissionAttachments: { some: {} } });
    }

    if (query.memberId) {
      wheres.push({ uploadedBy: { publicId: query.memberId } });
    }

    if (query.teamId) {
      wheres.push({
        uploadedBy: { teamMembership: { team: { publicId: query.teamId } } },
      });
    }

    if (query.search) {
      wheres.push({
        originalName: { contains: query.search, mode: 'insensitive' },
      });
    }

    return wheres;
  }
}

function getDocumentOrderBy(
  sort?: DocumentSort,
): Prisma.FileAssetOrderByWithRelationInput {
  if (sort === DocumentSort.CREATED_AT_ASC) {
    return { createdAt: 'asc' };
  }
  return { createdAt: 'desc' };
}
