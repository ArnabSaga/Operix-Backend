import {
  buildContentDisposition,
  mapAttachmentResponse,
} from '../../../src/modules/file/file.mapper';

describe('file mapper', () => {
  it('maps safe attachment responses without storage metadata', () => {
    expect(
      mapAttachmentResponse({
        id: 'attachment-a',
        file: {
          id: 'file-a',
          originalName: 'document.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 123,
          uploadedById: 'admin-a',
          createdAt: new Date('2026-08-22T00:00:00.000Z'),
        },
      }),
    ).toEqual({
      id: 'attachment-a',
      file: {
        id: 'file-a',
        originalName: 'document.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 123,
        uploadedById: 'admin-a',
        createdAt: new Date('2026-08-22T00:00:00.000Z'),
      },
      downloadUrl: '/api/v1/files/file-a/download',
    });
  });

  it('builds a header safe content disposition', () => {
    expect(buildContentDisposition('bad"\r\nname.pdf')).toContain(
      'filename="bad___name.pdf"',
    );
  });
});
