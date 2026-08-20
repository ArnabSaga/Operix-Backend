import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { writeActivity } from '../../../shared/activity/activity-write.js';
import { AppException } from '../../../shared/errors/app.exception.js';
import { runSerializableTransaction } from '../../../shared/database/serializable-transaction.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../../shared/pagination/pagination.helper.js';
import type { PaginationInput } from '../../../shared/pagination/pagination.interface.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';
import { AccountProvisioningService } from '../account-provisioning.service.js';
import type {
  SafeUserResponse,
  PaginatedResponse,
} from '../user-management.interface.js';
import {
  USER_MANAGEMENT_ACTIVITY,
  USER_MANAGEMENT_ERROR_CODE,
} from '../user-management.constant.js';
import { adminSelect } from './admin.select.js';
import type { CreateAdminDto } from './dto/create-admin.dto.js';
import type { UpdateAdminDto } from './dto/update-admin.dto.js';
import type { UpdateAdminStatusDto } from './dto/update-admin-status.dto.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioner: AccountProvisioningService,
  ) {}

  async createAdmin(
    viewer: OperixViewer,
    dto: CreateAdminDto,
  ): Promise<SafeUserResponse> {
    const admin = await this.provisioner.provisionAccount({
      name: dto.name,
      email: dto.email,
      initialPassword: dto.initialPassword,
      employeeId: dto.employeeId ?? null,
      designation: dto.designation ?? null,
      role: UserRole.ADMIN,
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        await writeActivity(tx, {
          actorId: viewer.userId,
          action: USER_MANAGEMENT_ACTIVITY.ADMIN_CREATED,
          entityType: 'USER',
          entityId: admin.id,
          metadata: {
            adminId: admin.id,
          },
        });
      });
    } catch (error) {
      await this.provisioner.cleanupCreatedUser(admin.id);
      throw error;
    }

    return admin;
  }

  async listAdmins(
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<SafeUserResponse>> {
    const normalized = normalizePagination(pagination);
    const where = {
      role: UserRole.ADMIN,
    } satisfies Prisma.UserWhereInput;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: adminSelect,
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

  async getAdmin(adminId: string): Promise<SafeUserResponse> {
    const admin = await this.prisma.user.findFirst({
      where: {
        id: adminId,
        role: UserRole.ADMIN,
      },
      select: adminSelect,
    });

    if (!admin) {
      throw this.adminNotFound();
    }

    return admin;
  }

  async updateAdmin(
    viewer: OperixViewer,
    adminId: string,
    dto: UpdateAdminDto,
  ): Promise<SafeUserResponse> {
    const admin = await this.getAdmin(adminId);
    const data = {
      name: dto.name,
      employeeId: dto.employeeId,
      designation: dto.designation,
    };
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as Pick<UpdateAdminDto, 'name' | 'employeeId' | 'designation'>;

    if (Object.keys(updateData).length === 0 || isNoOp(admin, updateData)) {
      return admin;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: adminId },
          data: updateData,
          select: adminSelect,
        });

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: USER_MANAGEMENT_ACTIVITY.ADMIN_UPDATED,
          entityType: 'USER',
          entityId: adminId,
          metadata: {
            adminId,
          },
        });

        return updated;
      });
    } catch (error) {
      throw mapUserConflict(error);
    }
  }

  async updateAdminStatus(
    viewer: OperixViewer,
    adminId: string,
    dto: UpdateAdminStatusDto,
  ): Promise<SafeUserResponse> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const admin = await tx.user.findFirst({
        where: {
          id: adminId,
          role: UserRole.ADMIN,
        },
        select: adminSelect,
      });

      if (!admin) {
        throw this.adminNotFound();
      }

      if (admin.status === dto.status) {
        return admin;
      }

      if (
        dto.status === UserStatus.INACTIVE ||
        dto.status === UserStatus.SUSPENDED
      ) {
        const ownedTeamCount = await tx.team.count({
          where: {
            adminId,
          },
        });

        if (ownedTeamCount > 0) {
          throw new AppException(
            HttpStatus.CONFLICT,
            USER_MANAGEMENT_ERROR_CODE.ADMIN_HAS_ASSIGNED_TEAMS,
            'Admin has assigned teams.',
          );
        }
      }

      const updated = await tx.user.update({
        where: { id: adminId },
        data: {
          status: dto.status,
        },
        select: adminSelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: USER_MANAGEMENT_ACTIVITY.ADMIN_STATUS_CHANGED,
        entityType: 'USER',
        entityId: adminId,
        metadata: {
          adminId,
          previousStatus: admin.status,
          newStatus: dto.status,
        },
      });

      return updated;
    });
  }

  private adminNotFound(): AppException {
    return new AppException(
      HttpStatus.NOT_FOUND,
      USER_MANAGEMENT_ERROR_CODE.ADMIN_NOT_FOUND,
      'Admin not found.',
    );
  }
}

function isNoOp(
  current: SafeUserResponse,
  update: Pick<UpdateAdminDto, 'name' | 'employeeId' | 'designation'>,
): boolean {
  return Object.entries(update).every(
    ([key, value]) => current[key as keyof SafeUserResponse] === value,
  );
}

function mapUserConflict(error: unknown): Error {
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
