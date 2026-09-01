import { Injectable, type PipeTransform } from '@nestjs/common';
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

  transform(value: unknown): unknown {
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
        this.validator.transform(String(entry));
      } else {
        this.validate(entry);
      }
    }
  }
}
