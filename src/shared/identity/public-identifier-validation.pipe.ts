import {
  ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { PublicIdPipe } from './public-id.pipe.js';

const PUBLIC_IDENTIFIER_FIELDS = new Set([
  'adminId',
  'memberId',
  'teamId',
  'taskId',
  'categoryId',
  'submissionId',
  'fileId',
  'attachmentId',
  'notificationId',
  'reportId',
  'itemId',
  'assignmentId',
  'actorId',
  'targetTeamId',
  'assignedMemberId',
]);

@Injectable()
export class PublicIdentifierValidationPipe implements PipeTransform {
  private readonly validator = new PublicIdPipe();

  transform(value: unknown, metadata?: ArgumentMetadata): unknown {
    if (metadata?.type === 'custom') {
      return value;
    }

    if (
      metadata?.data &&
      PUBLIC_IDENTIFIER_FIELDS.has(metadata.data) &&
      typeof value === 'string'
    ) {
      if (value.trim().length > 0) {
        this.validator.transform(value.trim());
      }
      return value;
    }

    this.validate(value);
    return value;
  }

  private validate(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach((entry) => this.validate(entry));
      return;
    }
    if (typeof value !== 'object' || value === null) return;

    for (const [key, entry] of Object.entries(value)) {
      if (
        PUBLIC_IDENTIFIER_FIELDS.has(key) &&
        entry !== null &&
        entry !== undefined
      ) {
        if (typeof entry === 'string' && entry.trim().length === 0) {
          continue;
        }
        this.validator.transform(String(entry));
      } else {
        this.validate(entry);
      }
    }
  }
}
