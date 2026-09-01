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
          publicId: '11111111-1111-4111-8111-111111111111',
          originalName: 'document.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 123,
          uploadedById: 'admin-a',
          uploadedBy: {
            publicId: '22222222-2222-4222-8222-222222222222',
          },
          createdAt: new Date('2026-08-22T00:00:00.000Z'),
        },
      }),
    ).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      file: {
        id: '11111111-1111-4111-8111-111111111111',
        originalName: 'document.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 123,
        uploadedById: '22222222-2222-4222-8222-222222222222',
        createdAt: new Date('2026-08-22T00:00:00.000Z'),
      },
      downloadUrl:
        '/api/v1/files/11111111-1111-4111-8111-111111111111/download',
    });
  });

  it('builds a header safe content disposition', () => {
    expect(buildContentDisposition('bad"\r\nname.pdf')).toContain(
      'filename="bad___name.pdf"',
    );
  });
});
