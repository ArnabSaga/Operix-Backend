import { HttpStatus } from '@nestjs/common';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { AppException } from '../../../src/shared/errors/app.exception';
import {
  canonicalizeDeclaredMimeType,
  normalizeOriginalFilename,
  validateUploadFiles,
} from '../../../src/shared/file-storage/file-validation';

const OOXML_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

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

  it('canonicalizes the browser JPEG alias and still verifies JPEG binary content', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]);

    await expect(
      validateUploadFiles(
        [
          uploadFile({
            originalname: 'photo.jpg',
            mimetype: 'image/jpg',
            size: jpeg.length,
            buffer: jpeg,
          }),
        ],
        { requireAtLeastOne: true },
      ),
    ).resolves.toEqual([expect.objectContaining({ mimeType: 'image/jpeg' })]);
    expect(canonicalizeDeclaredMimeType(' IMAGE/JPG ')).toBe('image/jpeg');

    await expect(
      validateUploadFiles(
        [
          uploadFile({
            originalname: 'photo.jpg',
            mimetype: 'image/jpg',
            buffer: Buffer.from('\u0089PNG\r\n\u001a\n', 'latin1'),
          }),
        ],
        { requireAtLeastOne: true },
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { code: APP_ERROR_CODE.FILE_TYPE_NOT_ALLOWED },
    });
  });

  it.each([
    ['docx', 'word/document.xml'],
    ['xlsx', 'xl/workbook.xml'],
    ['pptx', 'ppt/presentation.xml'],
  ] as const)(
    'accepts a verified %s package declared with a generic browser MIME',
    async (extension, contentPath) => {
      const buffer = createOoxmlBuffer(extension, contentPath);

      await expect(
        validateUploadFiles(
          [
            uploadFile({
              originalname: `report.${extension}`,
              mimetype: 'application/octet-stream',
              size: buffer.length,
              buffer,
            }),
          ],
          { requireAtLeastOne: true },
        ),
      ).resolves.toEqual([
        expect.objectContaining({ mimeType: OOXML_MIME[extension] }),
      ]);
    },
  );

  it('rejects a generic ZIP renamed as an Office document', async () => {
    const buffer = createZip([{ name: 'notes.txt', data: 'not office' }]);

    await expect(
      validateUploadFiles(
        [
          uploadFile({
            originalname: 'report.docx',
            mimetype: 'application/zip',
            size: buffer.length,
            buffer,
          }),
        ],
        { requireAtLeastOne: true },
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { code: APP_ERROR_CODE.FILE_TYPE_NOT_ALLOWED },
    });
  });

  it('rejects an OOXML subtype renamed to a different Office extension', async () => {
    const buffer = createOoxmlBuffer('xlsx', 'xl/workbook.xml');

    await expect(
      validateUploadFiles(
        [
          uploadFile({
            originalname: 'report.docx',
            mimetype: 'application/zip',
            size: buffer.length,
            buffer,
          }),
        ],
        { requireAtLeastOne: true },
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { code: APP_ERROR_CODE.FILE_TYPE_NOT_ALLOWED },
    });
  });
});

function createOoxmlBuffer(
  extension: keyof typeof OOXML_MIME,
  contentPath: string,
): Buffer {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    `<Override PartName="/${contentPath}" ContentType="${OOXML_MIME[extension]}.main+xml"/>` +
    '</Types>';
  return createZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: contentPath, data: '<document />' },
  ]);
}

function createZip(entries: { name: string; data: string }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
