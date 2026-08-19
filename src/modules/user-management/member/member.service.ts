import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { UserRole } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { writeActivity } from '../../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';
import { APP_ERROR_CODE } from '../../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../../shared/errors/app.exception.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../../shared/pagination/pagination.helper.js';
import type { PaginationInput } from '../../../shared/pagination/pagination.interface.js';
import { TeamService } from '../../team/team.service.js';
import { AccountProvisioningService } from '../account-provisioning.service.js';
import {
  USER_MANAGEMENT_ACTIVITY,
  USER_MANAGEMENT_ERROR_CODE,
} from '../user-management.constant.js';
import type {
  PaginatedResponse,
  SafeUserResponse,
} from '../user-management.interface.js';
import { memberSelect } from './member.select.js';
import { buildMemberScopeWhere } from './member-scope.policy.js';
import type { CreateMemberDto } from './dto/create-member.dto.js';
import type { TransferMemberDto } from './dto/transfer-member.dto.js';
import type { UpdateMemberDto } from './dto/update-member.dto.js';
import type { UpdateMemberStatusDto } from './dto/update-member-status.dto.js';

@Injectable()
export class MemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioner: AccountProvisioningService,
    private readonly teamService: TeamService,
  ) {}

  async createMember(
    viewer: OperixViewer,
    dto: CreateMemberDto,
  ): Promise<SafeUserResponse> {
    const member = await this.provisioner.provisionAccount({
      name: dto.name,
      email: dto.email,
      initialPassword: dto.initialPassword,
      employeeId: dto.employeeId ?? null,
      designation: dto.designation ?? null,
      role: UserRole.MEMBER,
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        await writeActivity(tx, {
          actorId: viewer.userId,
          action: USER_MANAGEMENT_ACTIVITY.MEMBER_CREATED,
          entityType: 'USER',
          entityId: member.id,
          metadata: {
            memberId: member.id,
          },
        });
      });
    } catch (error) {
      await this.provisioner.cleanupCreatedUser(member.id);
      throw error;
    }

    return member;
  }

  async listMembers(
    viewer: OperixViewer,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<SafeUserResponse>> {
    const normalized = normalizePagination(pagination);
    const where = buildMemberScopeWhere(viewer);

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: memberSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: normalized.skip,
        take: normalized.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: createPaginationMeta({
        page: normalized.page,
        limit: normalized.limit,
        total,
      }),
    };
  }

  async getMember(
    viewer: OperixViewer,
    memberId: string,
  ): Promise<SafeUserResponse> {
    const member = await this.prisma.user.findFirst({
      where: {
        id: memberId,
        ...buildMemberScopeWhere(viewer),
      },
      select: memberSelect,
    });

    if (!member) {
      throw this.memberNotFound();
    }

    return member;
  }

  async updateMember(
    viewer: OperixViewer,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<SafeUserResponse> {
    if (viewer.role === UserRole.ADMIN && dto.employeeId !== undefined) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        APP_ERROR_CODE.FORBIDDEN,
        'You do not have access to modify this field.',
      );
    }

    const member = await this.getMember(viewer, memberId);
    const data =
      viewer.role === UserRole.SUPER_ADMIN
        ? {
            name: dto.name,
            employeeId: dto.employeeId,
            designation: dto.designation,
          }
        : {
            name: dto.name,
            designation: dto.designation,
          };
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as Pick<UpdateMemberDto, 'name' | 'employeeId' | 'designation'>;

    if (Object.keys(updateData).length === 0 || isNoOp(member, updateData)) {
      return member;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: memberId },
          data: updateData,
          select: memberSelect,
        });

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: USER_MANAGEMENT_ACTIVITY.MEMBER_UPDATED,
          entityType: 'USER',
          entityId: memberId,
          metadata: {
            memberId,
          },
        });

        return updated;
      });
    } catch (error) {
      throw mapMemberConflict(error);
    }
  }

  async updateMemberStatus(
    viewer: OperixViewer,
    memberId: string,
    dto: UpdateMemberStatusDto,
  ): Promise<SafeUserResponse> {
    const member = await this.prisma.user.findFirst({
      where: {
        id: memberId,
        role: UserRole.MEMBER,
      },
      select: memberSelect,
    });

    if (!member) {
      throw this.memberNotFound();
    }

    if (member.status === dto.status) {
      return member;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: memberId },
        data: {
          status: dto.status,
        },
        select: memberSelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: USER_MANAGEMENT_ACTIVITY.MEMBER_STATUS_CHANGED,
        entityType: 'USER',
        entityId: memberId,
        metadata: {
          memberId,
          previousStatus: member.status,
          newStatus: dto.status,
        },
      });

      return updated;
    });
  }

  transferMember(
    viewer: OperixViewer,
    memberId: string,
    dto: TransferMemberDto,
  ) {
    return this.teamService.transferMember(viewer, memberId, dto.targetTeamId);
  }

  private memberNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      USER_MANAGEMENT_ERROR_CODE.MEMBER_NOT_FOUND,
      'Member not found.',
    );
  }
}

function isNoOp(
  current: SafeUserResponse,
  update: Pick<UpdateMemberDto, 'name' | 'employeeId' | 'designation'>,
): boolean {
  return Object.entries(update).every(
    ([key, value]) => current[key as keyof SafeUserResponse] === value,
  );
}

function mapMemberConflict(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new AppException(
      HttpStatus.CONFLICT,
      USER_MANAGEMENT_ERROR_CODE.EMPLOYEE_ID_ALREADY_EXISTS,
      'Employee ID already exists.',
    );
  }

  return error instanceof Error ? error : new Error('Unexpected error.');
}
