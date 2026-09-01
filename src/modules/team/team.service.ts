import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { UserRole, UserStatus } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { createNotification } from '../../shared/notification/notification-write.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import type { PaginationInput } from '../../shared/pagination/pagination.interface.js';
import { USER_MANAGEMENT_ERROR_CODE } from '../user-management/user-management.constant.js';
import {
  TEAM_ACTIVITY,
  TEAM_ERROR_CODE,
  TEAM_NOTIFICATION,
} from './team.constant.js';
import type { AssignMemberDto } from './dto/assign-member.dto.js';
import type { CreateTeamDto } from './dto/create-team.dto.js';
import type { ReassignTeamAdminDto } from './dto/reassign-team-admin.dto.js';
import type { UpdateTeamDto } from './dto/update-team.dto.js';
import { teamSelect } from './team.select.js';
import { buildTeamScopeWhere } from './team-scope.policy.js';
import type {
  PaginatedTeamResponse,
  SafeTeamResponse,
} from './team.interface.js';
import { mapTeamResponse } from './team.mapper.js';

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(
    viewer: OperixViewer,
    dto: CreateTeamDto,
  ): Promise<SafeTeamResponse> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const adminId = await this.resolveActiveAdminId(tx, dto.adminId);

      const team = await tx.team.create({
        data: {
          name: dto.name,
          adminId,
        },
        select: teamSelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: TEAM_ACTIVITY.TEAM_CREATED,
        entityType: 'TEAM',
        entityId: team.id,
        metadata: {
          teamId: team.id,
          adminId: team.adminId,
        },
      });

      return mapTeamResponse(team);
    });
  }

  async listTeams(
    viewer: OperixViewer,
    pagination: PaginationInput,
  ): Promise<PaginatedTeamResponse> {
    const normalized = normalizePagination(pagination);
    const where = buildTeamScopeWhere(viewer);

    const [data, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        select: teamSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.team.count({ where }),
    ]);

    return {
      data: data.map(mapTeamResponse),
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  async getTeam(
    viewer: OperixViewer,
    teamId: string,
  ): Promise<SafeTeamResponse> {
    const team = await this.prisma.team.findFirst({
      where: {
        publicId: teamId,
        ...buildTeamScopeWhere(viewer),
      },
      select: teamSelect,
    });

    if (!team) {
      throw this.teamNotFound();
    }

    return mapTeamResponse(team);
  }

  async updateTeam(
    viewer: OperixViewer,
    teamId: string,
    dto: UpdateTeamDto,
  ): Promise<SafeTeamResponse> {
    const current = await this.prisma.team.findFirst({
      where: { publicId: teamId, ...buildTeamScopeWhere(viewer) },
      select: teamSelect,
    });
    if (!current) throw this.teamNotFound();
    const team = mapTeamResponse(current);

    if (dto.name === undefined || dto.name === team.name) {
      return team;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.team.update({
        where: {
          id: current.id,
        },
        data: {
          name: dto.name,
        },
        select: teamSelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: TEAM_ACTIVITY.TEAM_UPDATED,
        entityType: 'TEAM',
        entityId: current.id,
        metadata: {
          teamId,
          previousName: team.name,
          newName: updated.name,
        },
      });

      return mapTeamResponse(updated);
    });
  }

  async reassignTeamAdmin(
    viewer: OperixViewer,
    teamId: string,
    dto: ReassignTeamAdminDto,
  ): Promise<SafeTeamResponse> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const team = await tx.team.findFirst({
        where: {
          publicId: teamId,
          ...buildTeamScopeWhere(viewer),
        },
        select: teamSelect,
      });

      if (!team) {
        throw this.teamNotFound();
      }

      const nextAdminId = await this.resolveActiveAdminId(tx, dto.adminId);
      if (team.adminId === nextAdminId) {
        throw new AppException(
          HttpStatus.CONFLICT,
          TEAM_ERROR_CODE.TEAM_ALREADY_ASSIGNED_TO_ADMIN,
          'Team is already assigned to this Admin.',
        );
      }

      const updated = await tx.team.update({
        where: {
          id: team.id,
        },
        data: {
          adminId: nextAdminId,
        },
        select: teamSelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: TEAM_ACTIVITY.TEAM_ADMIN_REASSIGNED,
        entityType: 'TEAM',
        entityId: team.id,
        metadata: {
          teamId,
          previousAdminId: team.adminId,
          newAdminId: nextAdminId,
        },
      });

      await createNotification(tx, {
        receiverId: nextAdminId,
        actorId: viewer.userId,
        type: TEAM_NOTIFICATION.TEAM_ADMIN_REASSIGNED,
        title: 'Team responsibility assigned',
        body: 'You have been assigned responsibility for a team.',
        targetType: 'TEAM',
        targetId: team.id,
      });

      return mapTeamResponse(updated);
    });
  }

  async assignMember(
    viewer: OperixViewer,
    teamId: string,
    dto: AssignMemberDto,
  ): Promise<SafeTeamResponse> {
    try {
      return await runSerializableTransaction(this.prisma, async (tx) => {
        const team = await this.findTeamWithAdminByPublicId(tx, teamId);
        this.assertTeamHasActiveAdmin(team);

        const member = await tx.user.findFirst({
          where: {
            publicId: dto.memberId,
            role: UserRole.MEMBER,
          },
          select: {
            id: true,
            status: true,
            teamMembership: {
              select: {
                id: true,
              },
            },
          },
        });

        if (!member) {
          throw this.memberNotFound();
        }

        if (member.status !== UserStatus.ACTIVE) {
          throw new AppException(
            HttpStatus.CONFLICT,
            TEAM_ERROR_CODE.TARGET_MEMBER_NOT_ACTIVE,
            'Target Member is not active.',
          );
        }

        if (member.teamMembership) {
          throw new AppException(
            HttpStatus.CONFLICT,
            TEAM_ERROR_CODE.MEMBER_ALREADY_ASSIGNED,
            'Member is already assigned to a team.',
          );
        }

        await tx.teamMember.create({
          data: {
            teamId: team.id,
            memberId: member.id,
          },
        });

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: TEAM_ACTIVITY.MEMBER_ASSIGNED_TO_TEAM,
          entityType: 'TEAM',
          entityId: team.id,
          metadata: {
            memberId: member.id,
            teamId: team.id,
            adminId: team.adminId,
          },
        });

        await createNotification(tx, {
          receiverId: member.id,
          actorId: viewer.userId,
          type: TEAM_NOTIFICATION.MEMBER_ASSIGNED_TO_TEAM,
          title: 'Team assignment updated',
          body: 'You have been assigned to a team.',
          targetType: 'TEAM',
          targetId: team.id,
        });

        const assignedTeam = await tx.team.findUniqueOrThrow({
          where: {
            id: team.id,
          },
          select: teamSelect,
        });

        return mapTeamResponse(assignedTeam);
      });
    } catch (error) {
      throw mapAssignmentRace(error);
    }
  }

  async transferMember(
    viewer: OperixViewer,
    memberId: string,
    targetTeamId: string,
  ): Promise<SafeTeamResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const member = await tx.user.findFirst({
          where: {
            publicId: memberId,
            role: UserRole.MEMBER,
          },
          select: {
            id: true,
            teamMembership: {
              select: {
                id: true,
                teamId: true,
                team: {
                  select: {
                    adminId: true,
                  },
                },
              },
            },
          },
        });

        if (!member) {
          throw this.memberNotFound();
        }

        if (!member.teamMembership) {
          throw new AppException(
            HttpStatus.CONFLICT,
            TEAM_ERROR_CODE.MEMBER_NOT_ASSIGNED,
            'Member is not assigned to a team.',
          );
        }

        const currentMembership = member.teamMembership;

        const targetTeam = await this.findTeamWithAdminByPublicId(
          tx,
          targetTeamId,
        );
        this.assertTeamHasActiveAdmin(targetTeam);

        if (currentMembership.teamId === targetTeam.id) {
          throw new AppException(
            HttpStatus.CONFLICT,
            TEAM_ERROR_CODE.MEMBER_ALREADY_IN_TARGET_TEAM,
            'Member is already assigned to the target team.',
          );
        }

        await tx.teamMember.delete({
          where: {
            id: currentMembership.id,
          },
        });

        await tx.teamMember.create({
          data: {
            teamId: targetTeam.id,
            memberId: member.id,
          },
        });

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: TEAM_ACTIVITY.MEMBER_TRANSFERRED,
          entityType: 'USER',
          entityId: member.id,
          metadata: {
            memberId: member.id,
            fromTeamId: currentMembership.teamId,
            toTeamId: targetTeam.id,
            fromAdminId: currentMembership.team.adminId,
            toAdminId: targetTeam.adminId,
          },
        });

        await createNotification(tx, {
          receiverId: member.id,
          actorId: viewer.userId,
          type: TEAM_NOTIFICATION.MEMBER_TRANSFERRED,
          title: 'Team assignment changed',
          body: 'You have been transferred to another team.',
          targetType: 'TEAM',
          targetId: targetTeam.id,
        });

        const updatedTeam = await tx.team.findUniqueOrThrow({
          where: {
            id: targetTeam.id,
          },
          select: teamSelect,
        });

        return mapTeamResponse(updatedTeam);
      });
    } catch (error) {
      throw mapTransferRace(error);
    }
  }

  private async resolveActiveAdminId(
    tx: {
      user: {
        findFirst: PrismaTransactionFindFirstUser;
      };
    },
    adminId: string,
  ): Promise<string> {
    const admin = await tx.user.findFirst({
      where: {
        publicId: adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (!admin) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TEAM_ERROR_CODE.TARGET_ADMIN_NOT_ACTIVE,
        'Target Admin is not active.',
      );
    }
    return admin.id;
  }

  private async findTeamWithAdmin(
    tx: Pick<Prisma.TransactionClient, 'team'>,
    teamId: string,
  ) {
    const team = await tx.team.findUnique({
      where: {
        id: teamId,
      },
      select: {
        id: true,
        adminId: true,
        admin: {
          select: {
            role: true,
            status: true,
          },
        },
      },
    });

    if (!team) {
      throw this.teamNotFound();
    }

    return team;
  }

  private async findTeamWithAdminByPublicId(
    tx: Pick<Prisma.TransactionClient, 'team'>,
    publicId: string,
  ) {
    const team = await tx.team.findUnique({
      where: { publicId },
      select: {
        id: true,
        adminId: true,
        admin: { select: { role: true, status: true } },
      },
    });
    if (!team) throw this.teamNotFound();
    return team;
  }

  private assertTeamHasActiveAdmin(team: {
    admin: {
      role: UserRole;
      status: UserStatus;
    };
  }): void {
    if (
      team.admin.role !== UserRole.ADMIN ||
      team.admin.status !== UserStatus.ACTIVE
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        TEAM_ERROR_CODE.TARGET_ADMIN_NOT_ACTIVE,
        'Target Admin is not active.',
      );
    }
  }

  private memberNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      USER_MANAGEMENT_ERROR_CODE.MEMBER_NOT_FOUND,
      'Member not found.',
    );
  }

  private teamNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      TEAM_ERROR_CODE.TEAM_NOT_FOUND,
      'Team not found.',
    );
  }
}

type PrismaTransactionFindFirstUser =
  PrismaTransactionUserDelegate['findFirst'];
type PrismaTransactionUserDelegate = Prisma.TransactionClient['user'];

function mapAssignmentRace(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      TEAM_ERROR_CODE.MEMBER_ALREADY_ASSIGNED,
      'Member is already assigned to a team.',
    );
  }

  return error instanceof Error ? error : new Error('Unexpected error.');
}

function mapTransferRace(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2025')
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      TEAM_ERROR_CODE.MEMBER_ASSIGNMENT_CHANGED,
      'The member assignment changed while processing this request. Please retry.',
    );
  }

  return error instanceof Error ? error : new Error('Unexpected error.');
}
