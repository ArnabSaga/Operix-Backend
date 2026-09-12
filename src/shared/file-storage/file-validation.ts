import path from 'node:path';

import { HttpStatus } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import {
  ALLOWED_FILE_MIME_TYPES,
  CANONICAL_MIME_TYPE_ALIASES,
  EXTENSIONS_BY_MIME_TYPE,
  GENERIC_OFFICE_MIME_TYPES,
  MAX_ATTACHMENT_FILES,
  MAX_FILE_SIZE_BYTES,
  MAX_ORIGINAL_NAME_LENGTH,
  MIME_TYPE_BY_FILE_TYPE_EXTENSION,
  OFFICE_MIME_TYPE_BY_EXTENSION,
} from './file-storage.constant.js';
import type { ValidatedUploadFile } from './file-storage.interface.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';

interface ValidateFilesOptions {
  requireAtLeastOne: boolean;
}

export async function validateUploadFiles(
  files: Express.Multer.File[] | undefined,
  options: ValidateFilesOptions,
): Promise<ValidatedUploadFile[]> {
  const incoming = files ?? [];

  if (options.requireAtLeastOne && incoming.length === 0) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      APP_ERROR_CODE.VALIDATION_ERROR,
      'At least one file is required.',
    );
  }

  if (incoming.length > MAX_ATTACHMENT_FILES) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      APP_ERROR_CODE.TOO_MANY_FILES,
      'Too many files were uploaded.',
    );
  }

  const validated: ValidatedUploadFile[] = [];

  for (const file of incoming) {
    validated.push(await validateUploadFile(file));
  }

  return validated;
}

export async function validateUploadFile(
  file: Express.Multer.File,
): Promise<ValidatedUploadFile> {
  if (file.size <= 0 || file.buffer.length === 0) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      APP_ERROR_CODE.VALIDATION_ERROR,
      'Uploaded files cannot be empty.',
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new AppException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      APP_ERROR_CODE.FILE_TOO_LARGE,
      'File is too large.',
    );
  }

  const originalName = normalizeOriginalFilename(file.originalname);
  const declaredMimeType = canonicalizeDeclaredMimeType(file.mimetype);
  const extension = path.extname(originalName).toLowerCase();
  const genericOfficeDeclaration =
    GENERIC_OFFICE_MIME_TYPES.has(declaredMimeType);
  const expectedOfficeMimeType = OFFICE_MIME_TYPE_BY_EXTENSION[extension];

  if (genericOfficeDeclaration && !expectedOfficeMimeType) {
    throw fileTypeNotAllowed();
  }
  if (
    !genericOfficeDeclaration &&
    (!ALLOWED_FILE_MIME_TYPES.has(declaredMimeType) ||
      !EXTENSIONS_BY_MIME_TYPE[declaredMimeType]?.includes(extension))
  ) {
    throw fileTypeNotAllowed();
  }

  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(file.buffer);
  } catch {
    throw fileTypeNotAllowed();
  }
  const detectedMimeType = detected
    ? (MIME_TYPE_BY_FILE_TYPE_EXTENSION[detected.ext] ?? detected.mime)
    : null;
  const canonicalMimeType = genericOfficeDeclaration
    ? expectedOfficeMimeType
    : declaredMimeType;

  if (detectedMimeType !== canonicalMimeType) {
    throw fileTypeNotAllowed();
  }

  return {
    originalName,
    mimeType: canonicalMimeType,
    sizeBytes: file.size,
    buffer: file.buffer,
  };
}

export function canonicalizeDeclaredMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return CANONICAL_MIME_TYPE_ALIASES[normalized] ?? normalized;
}

export function normalizeOriginalFilename(value: string): string {
  const basename = value.replaceAll('\\', '/').split('/').pop()?.trim() ?? '';
  const normalized = basename
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 || character === '"' ? '_' : character;
    })
    .join('')
    .replace(/[<>:|?*]/g, '_')
    .trim();

  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.length > MAX_ORIGINAL_NAME_LENGTH
  ) {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      APP_ERROR_CODE.VALIDATION_ERROR,
      'Filename is invalid.',
    );
  }

  return normalized;
}

function fileTypeNotAllowed(): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    APP_ERROR_CODE.FILE_TYPE_NOT_ALLOWED,
    'File type is not allowed.',
  );
}
