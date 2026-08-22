import path from 'node:path';

import { HttpStatus } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { normalizeOriginalFilename } from '../file-storage/file-validation.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import {
  SPREADSHEET_EXTENSION,
  SPREADSHEET_LIMIT,
  SPREADSHEET_MIME_TYPE,
} from './spreadsheet.constant.js';

export interface ValidatedImportWorkbook {
  originalName: string;
  mimeType: typeof SPREADSHEET_MIME_TYPE;
  sizeBytes: number;
  buffer: Buffer;
}

export async function validateImportWorkbook(
  file: Express.Multer.File | undefined,
): Promise<ValidatedImportWorkbook> {
  if (!file) {
    throw importValidationError('Workbook file is required.');
  }

  if (file.size <= 0 || file.buffer.length === 0) {
    throw importValidationError('Workbook file cannot be empty.');
  }

  if (file.size > SPREADSHEET_LIMIT.MAX_IMPORT_WORKBOOK_SIZE_BYTES) {
    throw new AppException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      APP_ERROR_CODE.FILE_TOO_LARGE,
      'Workbook file is too large.',
    );
  }

  const originalName = normalizeOriginalFilename(file.originalname);

  if (path.extname(originalName).toLowerCase() !== SPREADSHEET_EXTENSION) {
    throw importFileInvalid('Only .xlsx workbooks are supported.');
  }

  if (file.mimetype !== SPREADSHEET_MIME_TYPE) {
    throw importFileInvalid('Workbook MIME type is invalid.');
  }

  const detected = await fileTypeFromBuffer(file.buffer);

  if (detected?.ext !== 'xlsx' || detected.mime !== SPREADSHEET_MIME_TYPE) {
    throw importFileInvalid('Workbook binary signature is invalid.');
  }

  assertWorkbookPackageAllowed(file.buffer);

  return {
    originalName,
    mimeType: SPREADSHEET_MIME_TYPE,
    sizeBytes: file.size,
    buffer: file.buffer,
  };
}

export function assertWorkbookPackageAllowed(buffer: Buffer): void {
  const markerText = buffer.toString('latin1');
  const lower = markerText.toLowerCase();

  if (
    lower.includes('vbaproject.bin') ||
    lower.includes('/vba') ||
    lower.includes('macrosheets') ||
    lower.includes('encryptedpackage')
  ) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      'IMPORT_WORKBOOK_UNSUPPORTED',
      'Workbook format is not supported.',
    );
  }
}

function importValidationError(message: string): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    APP_ERROR_CODE.VALIDATION_ERROR,
    message,
  );
}

function importFileInvalid(message: string): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    'IMPORT_FILE_INVALID',
    message,
  );
}
