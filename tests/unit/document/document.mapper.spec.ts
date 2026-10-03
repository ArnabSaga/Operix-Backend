import { DocumentSource } from '../../../src/modules/document/document.constant';
import type { DocumentResponseSource } from '../../../src/modules/document/document.interface';
import { mapDocumentResponse } from '../../../src/modules/document/document.mapper';

function baseRow(
  overrides: Partial<DocumentResponseSource> = {},
): DocumentResponseSource {
  return {
    publicId: 'file-public-a',
    originalName: 'Assignment.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123,
    createdAt: new Date('2026-10-04T00:00:00.000Z'),
    uploadedBy: { publicId: 'member-public-a', name: 'Member A' },
    taskAttachments: [],
    submissionAttachments: [],
    ...overrides,
  };
}

describe('mapDocumentResponse', () => {
  it('maps a task source without submission data', () => {
    const mapped = mapDocumentResponse(
      baseRow({
        taskAttachments: [
          { task: { publicId: 'task-public-a', title: 'Test Task' } },
        ],
      }),
    );

    expect(mapped).toEqual({
      id: 'file-public-a',
      name: 'Assignment.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 123,
      uploadedAt: new Date('2026-10-04T00:00:00.000Z'),
      uploadedBy: { id: 'member-public-a', name: 'Member A' },
      source: {
        type: DocumentSource.TASK_ATTACHMENT,
        task: { id: 'task-public-a', title: 'Test Task' },
        submission: null,
      },
      downloadUrl: '/api/v1/files/file-public-a/download',
    });
  });

  it('maps a submission source with task context', () => {
    const mapped = mapDocumentResponse(
      baseRow({
        submissionAttachments: [
          {
            submission: {
              publicId: 'submission-public-a',
              version: 2,
              task: { publicId: 'task-public-a', title: 'Test Task' },
            },
          },
        ],
      }),
    );

    expect(mapped?.source).toEqual({
      type: DocumentSource.SUBMISSION_ATTACHMENT,
      task: { id: 'task-public-a', title: 'Test Task' },
      submission: { id: 'submission-public-a', version: 2 },
    });
  });

  it('prefers the submission source deterministically when both exist', () => {
    const mapped = mapDocumentResponse(
      baseRow({
        taskAttachments: [
          { task: { publicId: 'task-public-a', title: 'Test Task' } },
        ],
        submissionAttachments: [
          {
            submission: {
              publicId: 'submission-public-a',
              version: 1,
              task: { publicId: 'task-public-a', title: 'Test Task' },
            },
          },
        ],
      }),
    );

    expect(mapped?.source.type).toBe(DocumentSource.SUBMISSION_ATTACHMENT);
  });

  it('returns null for source-less rows and exposes no private identifiers', () => {
    expect(mapDocumentResponse(baseRow())).toBeNull();

    const mapped = mapDocumentResponse(
      baseRow({
        taskAttachments: [
          { task: { publicId: 'task-public-a', title: 'Test Task' } },
        ],
      }),
    );
    const serialized = JSON.stringify(mapped);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('uploadedById');
    expect(serialized).not.toContain('member-a');
    expect(serialized).not.toContain('task-a');
    expect(Object.keys(mapped as object).sort()).toEqual(
      [
        'downloadUrl',
        'id',
        'mimeType',
        'name',
        'sizeBytes',
        'source',
        'uploadedAt',
        'uploadedBy',
      ].sort(),
    );
  });
});
