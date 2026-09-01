import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.js';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { writeActivity } from '../../../shared/activity/activity-write.js';
import { AppException } from '../../../shared/errors/app.exception.js';
import { runSerializableTransaction } from '../../../shared/database/serializable-transaction.js';
import { MailService } from '../../../shared/mail/mail.service.js';
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
import { mapSafeUser } from '../user-management.mapper.js';
import type { CreateAdminDto } from './dto/create-admin.dto.js';
import type { UpdateAdminDto } from './dto/update-admin.dto.js';
import type { UpdateAdminStatusDto } from './dto/update-admin-status.dto.js';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioner: AccountProvisioningService,
    private readonly mailService: MailService,
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

    try {
      await this.mailService.sendWelcomeUserEmail({
        userId: admin.id,
        recipientName: admin.name,
        accountEmail: admin.email,
        role: 'ADMIN',
      });
    } catch (error) {
      this.logger.warn('Admin Welcome email failed.', {
        userId: admin.id,
        errorName: getErrorName(error),
      });
    }

    return mapSafeUser(admin);
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
      data: data.map(mapSafeUser),
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
        publicId: adminId,
        role: UserRole.ADMIN,
      },
      select: adminSelect,
    });

    if (!admin) {
      throw this.adminNotFound();
    }

    return mapSafeUser(admin);
  }

  async updateAdmin(
    viewer: OperixViewer,
    adminId: string,
    dto: UpdateAdminDto,
  ): Promise<SafeUserResponse> {
    const adminRecord = await this.prisma.user.findFirst({
      where: { publicId: adminId, role: UserRole.ADMIN },
      select: adminSelect,
    });
    if (!adminRecord) throw this.adminNotFound();
    const admin = mapSafeUser(adminRecord);
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
          where: { id: adminRecord.id },
          data: updateData,
          select: adminSelect,
        });

        await writeActivity(tx, {
          actorId: viewer.userId,
          action: USER_MANAGEMENT_ACTIVITY.ADMIN_UPDATED,
          entityType: 'USER',
          entityId: adminRecord.id,
          metadata: {
            adminId,
          },
        });

        return mapSafeUser(updated);
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
          publicId: adminId,
          role: UserRole.ADMIN,
        },
        select: adminSelect,
      });

      if (!admin) {
        throw this.adminNotFound();
      }

      if (admin.status === dto.status) {
        return mapSafeUser(admin);
      }

      if (
        dto.status === UserStatus.INACTIVE ||
        dto.status === UserStatus.SUSPENDED
      ) {
        const ownedTeamCount = await tx.team.count({
          where: {
            adminId: admin.id,
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
        where: { id: admin.id },
        data: {
          status: dto.status,
        },
        select: adminSelect,
      });

      await writeActivity(tx, {
        actorId: viewer.userId,
        action: USER_MANAGEMENT_ACTIVITY.ADMIN_STATUS_CHANGED,
        entityType: 'USER',
        entityId: admin.id,
        metadata: {
          adminId,
          previousStatus: admin.status,
          newStatus: dto.status,
        },
      });

      return mapSafeUser(updated);
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

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
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
