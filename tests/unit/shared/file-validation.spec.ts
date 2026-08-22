import { HttpStatus } from '@nestjs/common';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { AppException } from '../../../src/shared/errors/app.exception';
import {
  normalizeOriginalFilename,
  validateUploadFiles,
} from '../../../src/shared/file-storage/file-validation';

function uploadFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'files',
    originalname: 'document.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 16,
    buffer: Buffer.from('%PDF-1.4\n%test\n'),
    destination: '',
    filename: '',
    path: '',
    stream: null as never,
    ...overrides,
  };
}

function expectAppException(
  error: unknown,
  expected: { status: number; code: string },
) {
  expect(error).toBeInstanceOf(AppException);
  const exception = error as AppException;

  expect(exception.getStatus()).toBe(expected.status);
  expect(exception.getResponse()).toMatchObject({
    code: expected.code,
  });
}

describe('file upload validation', () => {
  it('accepts a PDF when filename, declared MIME, and signature agree', async () => {
    await expect(
      validateUploadFiles([uploadFile()], { requireAtLeastOne: true }),
    ).resolves.toEqual([
      expect.objectContaining({
        originalName: 'document.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 16,
      }),
    ]);
  });

  it('rejects empty Task attachment uploads before storage work', async () => {
    try {
      await validateUploadFiles([], { requireAtLeastOne: true });
      throw new Error('Expected validation failure.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.BAD_REQUEST,
        code: APP_ERROR_CODE.VALIDATION_ERROR,
      });
    }
  });

  it('rejects MIME and extension mismatches', async () => {
    try {
      await validateUploadFiles(
        [
          uploadFile({
            originalname: 'document.png',
          }),
        ],
        { requireAtLeastOne: true },
      );
      throw new Error('Expected validation failure.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.BAD_REQUEST,
        code: APP_ERROR_CODE.FILE_TYPE_NOT_ALLOWED,
      });
    }
  });

  it('normalizes path-like filenames into a safe basename', () => {
    expect(normalizeOriginalFilename('C:\\unsafe\\report.pdf')).toBe(
      'report.pdf',
    );
    expect(normalizeOriginalFilename('../report.pdf')).toBe('report.pdf');
    expect(normalizeOriginalFilename('bad"name.pdf')).toBe('bad_name.pdf');
  });
});
