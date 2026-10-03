import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import { DocumentSource } from '../../../src/modules/document/document.constant';
import { DocumentService } from '../../../src/modules/document/document.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

interface FakeRow {
  publicId: string;
  originalName: string;
  uploaderId: string;
  uploaderPublicId: string;
  uploaderRole: string;
  taskLinks: number;
  submissionLinks: number;
}

interface FakeDb {
  membership: Map<string, string>;
  adminOfTeam: Map<string, string>;
  teamPublicId: Map<string, string>;
}

function viewer(
  userId: string,
  role: UserRole,
  scope: OperixViewer['scope'],
): OperixViewer {
  return { userId, role, status: UserStatus.ACTIVE, scope };
}

function matchesCondition(
  row: FakeRow,
  db: FakeDb,
  condition: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(condition)) {
    if (key === 'AND') {
      if (
        !(value as Record<string, unknown>[]).every((entry) =>
          matchesCondition(row, db, entry),
        )
      ) {
        return false;
      }
      continue;
    }
    if (key === 'OR') {
      if (
        !(value as Record<string, unknown>[]).some((entry) =>
          matchesCondition(row, db, entry),
        )
      ) {
        return false;
      }
      continue;
    }
    if (key === 'taskAttachments' || key === 'submissionAttachments') {
      const links =
        key === 'taskAttachments' ? row.taskLinks : row.submissionLinks;
      const ops = value as Record<string, unknown>;
      if ('some' in ops && links === 0) return false;
      if ('none' in ops && links > 0) return false;
      continue;
    }
    if (key === 'uploadedById') {
      if (row.uploaderId !== value) return false;
      continue;
    }
    if (key === 'uploadedBy') {
      const nested = value as Record<string, unknown>;
      if (
        nested.publicId !== undefined &&
        row.uploaderPublicId !== nested.publicId
      ) {
        return false;
      }
      if (nested.role !== undefined && row.uploaderRole !== nested.role) {
        return false;
      }
      const membership = nested.teamMembership as
        { team?: Record<string, unknown> } | undefined;
      if (membership?.team) {
        const teamId = db.membership.get(row.uploaderId) ?? null;
        if (membership.team.adminId !== undefined) {
          if (
            !teamId ||
            db.adminOfTeam.get(teamId) !== membership.team.adminId
          ) {
            return false;
          }
        }
        if (membership.team.publicId !== undefined) {
          if (
            !teamId ||
            db.teamPublicId.get(teamId) !== membership.team.publicId
          ) {
            return false;
          }
        }
      }
      continue;
    }
    if (key === 'originalName') {
      const filter = value as { contains: string };
      if (
        !row.originalName.toLowerCase().includes(filter.contains.toLowerCase())
      ) {
        return false;
      }
      continue;
    }
  }
  return true;
}

function toSelectShape(row: FakeRow) {
  return {
    publicId: row.publicId,
    originalName: row.originalName,
    mimeType: 'application/pdf',
    sizeBytes: 100,
    createdAt: new Date('2026-10-04T00:00:00.000Z'),
    uploadedBy: {
      publicId: row.uploaderPublicId,
      name: `Uploader ${row.publicId}`,
    },
    taskAttachments:
      row.taskLinks > 0
        ? [
            {
              task: {
                publicId: `task-${row.publicId}`,
                title: `Task ${row.publicId}`,
              },
            },
          ]
        : [],
    submissionAttachments:
      row.submissionLinks > 0
        ? [
            {
              submission: {
                publicId: `submission-${row.publicId}`,
                version: 1,
                task: {
                  publicId: `task-${row.publicId}`,
                  title: `Task ${row.publicId}`,
                },
              },
            },
          ]
        : [],
  };
}

function createHarness(rows: FakeRow[], db: FakeDb) {
  const fileAsset = {
    findMany: jestApi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(
        rows
          .filter((row) => matchesCondition(row, db, args.where))
          .map(toSelectShape),
      ),
    ),
    count: jestApi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(
        rows.filter((row) => matchesCondition(row, db, args.where)).length,
      ),
    ),
  };
  const prisma = { fileAsset };
  const service = new DocumentService(prisma as unknown as PrismaService);
  return { fileAsset, service };
}

const SUPER_ADMIN = viewer('chief-a', UserRole.SUPER_ADMIN, { type: 'GLOBAL' });
const ADMIN_A = viewer('admin-a', UserRole.ADMIN, {
  type: 'ADMIN',
  teamIds: ['team-a'],
});
const ADMIN_B = viewer('admin-b', UserRole.ADMIN, {
  type: 'ADMIN',
  teamIds: ['team-b'],
});
const MEMBER_A = viewer('member-a', UserRole.MEMBER, {
  type: 'MEMBER',
  teamId: 'team-a',
});

function createDb(): FakeDb {
  return {
    membership: new Map([
      ['member-a', 'team-a'],
      ['member-b', 'team-b'],
    ]),
    adminOfTeam: new Map([
      ['team-a', 'admin-a'],
      ['team-b', 'admin-b'],
    ]),
    teamPublicId: new Map([
      ['team-a', 'team-public-a'],
      ['team-b', 'team-public-b'],
    ]),
  };
}

function createRows(): FakeRow[] {
  return [
    {
      publicId: 'file-a',
      originalName: 'A.pdf',
      uploaderId: 'member-a',
      uploaderPublicId: 'member-public-a',
      uploaderRole: UserRole.MEMBER,
      taskLinks: 0,
      submissionLinks: 1,
    },
    {
      publicId: 'file-b',
      originalName: 'B.pdf',
      uploaderId: 'member-b',
      uploaderPublicId: 'member-public-b',
      uploaderRole: UserRole.MEMBER,
      taskLinks: 1,
      submissionLinks: 0,
    },
    {
      publicId: 'file-admin-a',
      originalName: 'Admin.pdf',
      uploaderId: 'admin-a',
      uploaderPublicId: 'admin-public-a',
      uploaderRole: UserRole.ADMIN,
      taskLinks: 1,
      submissionLinks: 0,
    },
    {
      publicId: 'file-orphan',
      originalName: 'Orphan.pdf',
      uploaderId: 'member-a',
      uploaderPublicId: 'member-public-a',
      uploaderRole: UserRole.MEMBER,
      taskLinks: 0,
      submissionLinks: 0,
    },
  ];
}

describe('DocumentService', () => {
  it('isolates members to their own legitimate documents', async () => {
    const { service } = createHarness(createRows(), createDb());

    const result = await service.listDocuments(MEMBER_A, {});

    expect(result.data.map((item) => item.id)).toEqual(['file-a']);
    expect(result.meta.total).toBe(1);
  });

  it('gives admins own plus current-team files and never other teams', async () => {
    const { service, fileAsset } = createHarness(createRows(), createDb());

    const result = await service.listDocuments(ADMIN_A, {});

    expect(result.data.map((item) => item.id).sort()).toEqual(
      ['file-a', 'file-admin-a'].sort(),
    );
    const countArgs = fileAsset.count.mock.calls[0]?.[0] as
      { where: unknown } | undefined;
    const findArgs = fileAsset.findMany.mock.calls[0]?.[0] as
      { where: unknown } | undefined;
    expect(countArgs?.where).toEqual(findArgs?.where);
  });

  it('gives super admins every legitimate document including orphans exclusion', async () => {
    const { service } = createHarness(createRows(), createDb());

    const result = await service.listDocuments(SUPER_ADMIN, {});

    expect(result.data.map((item) => item.id).sort()).toEqual(
      ['file-a', 'file-admin-a', 'file-b'].sort(),
    );
  });

  it('moves admin access with a real membership change', async () => {
    const db = createDb();
    const { service } = createHarness(createRows(), db);

    const beforeA = await service.listDocuments(ADMIN_A, {});
    expect(beforeA.data.map((item) => item.id)).toContain('file-a');

    db.membership.set('member-a', 'team-b');

    const afterA = await service.listDocuments(ADMIN_A, {});
    expect(afterA.data.map((item) => item.id)).not.toContain('file-a');
    const afterB = await service.listDocuments(ADMIN_B, {});
    expect(afterB.data.map((item) => item.id)).toContain('file-a');
  });

  it('intersects public memberId and teamId filters with role scope', async () => {
    const { service } = createHarness(createRows(), createDb());

    const crossTeam = await service.listDocuments(ADMIN_A, {
      memberId: 'member-public-b',
    });
    expect(crossTeam.data).toHaveLength(0);

    const ownTeam = await service.listDocuments(ADMIN_A, {
      memberId: 'member-public-a',
    });
    expect(ownTeam.data.map((item) => item.id)).toEqual(['file-a']);

    const teamFilter = await service.listDocuments(SUPER_ADMIN, {
      teamId: 'team-public-b',
    });
    expect(teamFilter.data.map((item) => item.id)).toEqual(['file-b']);

    const memberScope = await service.listDocuments(MEMBER_A, {
      memberId: 'member-public-b',
    });
    expect(memberScope.data).toHaveLength(0);
  });

  it('applies source filters consistently with mapping precedence', async () => {
    const { service } = createHarness(createRows(), createDb());

    const submissions = await service.listDocuments(SUPER_ADMIN, {
      source: DocumentSource.SUBMISSION_ATTACHMENT,
    });
    expect(submissions.data.map((item) => item.id)).toEqual(['file-a']);

    const tasks = await service.listDocuments(SUPER_ADMIN, {
      source: DocumentSource.TASK_ATTACHMENT,
    });
    expect(tasks.data.map((item) => item.id).sort()).toEqual(
      ['file-admin-a', 'file-b'].sort(),
    );
  });
});
