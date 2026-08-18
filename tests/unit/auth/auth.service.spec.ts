import { OperixAuthService } from '../../../src/modules/auth/auth.service';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';

describe('OperixAuthService', () => {
  const service = new OperixAuthService({} as never);

  it('maps SUPER_ADMIN to global scope', () => {
    expect(
      service.resolveScope({
        role: UserRole.SUPER_ADMIN,
        administeredTeamIds: [],
        memberTeamId: null,
      }),
    ).toEqual({ type: 'GLOBAL' });
  });

  it('maps ADMIN to administered team scope', () => {
    expect(
      service.resolveScope({
        role: UserRole.ADMIN,
        administeredTeamIds: ['team-a', 'team-b'],
        memberTeamId: null,
      }),
    ).toEqual({
      type: 'ADMIN',
      teamIds: ['team-a', 'team-b'],
    });
  });

  it('maps MEMBER to membership team scope', () => {
    expect(
      service.resolveScope({
        role: UserRole.MEMBER,
        administeredTeamIds: [],
        memberTeamId: 'team-a',
      }),
    ).toEqual({
      type: 'MEMBER',
      teamId: 'team-a',
    });
  });

  it('preserves viewer status separately from scope for later account blocking', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-a',
          role: UserRole.MEMBER,
          status: UserStatus.SUSPENDED,
          administeredTeams: [],
          teamMembership: null,
        }),
      },
    };
    const viewerService = new OperixAuthService(prisma as never);

    await expect(viewerService.getViewer('user-a')).resolves.toEqual({
      userId: 'user-a',
      role: UserRole.MEMBER,
      status: UserStatus.SUSPENDED,
      scope: {
        type: 'MEMBER',
        teamId: null,
      },
    });
  });
});
