import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  UserStatus,
  type UserRole as UserRoleValue,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { createOperixProvisioningAuth } from '../auth/auth.factory.js';
import { adminSelect } from './admin/admin.select.js';
import { USER_MANAGEMENT_ERROR_CODE } from './user-management.constant.js';
import type { SafeUserResponse } from './user-management.interface.js';

export interface AccountProvisioningInput {
  name: string;
  email: string;
  initialPassword: string;
  employeeId?: string | null;
  designation?: string | null;
  role: Extract<UserRoleValue, 'ADMIN' | 'MEMBER'>;
}

@Injectable()
export class AccountProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async provisionAccount(
    input: AccountProvisioningInput,
  ): Promise<SafeUserResponse> {
    await this.assertEmailAvailable(input.email);
    await this.assertEmployeeIdAvailable(input.employeeId ?? null);

    const auth = createOperixProvisioningAuth({
      prisma: this.prisma,
      baseUrl: this.config.getOrThrow<string>('auth.baseUrl'),
      secret: this.config.getOrThrow<string>('auth.secret'),
      forcedRole: input.role,
    });

    await auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.initialPassword,
        name: input.name,
      },
    });

    const createdUser = await this.prisma.user.findUnique({
      where: {
        email: input.email,
      },
      select: adminSelect,
    });

    if (createdUser?.role !== input.role) {
      if (createdUser?.id) {
        await this.cleanupUser(createdUser.id);
      }

      throw new AppException(
        HttpStatus.CONFLICT,
        USER_MANAGEMENT_ERROR_CODE.ACCOUNT_PROVISIONING_FAILED,
        'Account provisioning failed.',
      );
    }

    try {
      return await this.prisma.user.update({
        where: {
          id: createdUser.id,
        },
        data: {
          employeeId: input.employeeId ?? null,
          designation: input.designation ?? null,
          status: UserStatus.ACTIVE,
        },
        select: adminSelect,
      });
    } catch (error) {
      await this.cleanupUser(createdUser.id);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          HttpStatus.CONFLICT,
          USER_MANAGEMENT_ERROR_CODE.EMPLOYEE_ID_ALREADY_EXISTS,
          'Employee ID already exists.',
        );
      }

      throw error;
    }
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        USER_MANAGEMENT_ERROR_CODE.EMAIL_ALREADY_EXISTS,
        'Email already exists.',
      );
    }
  }

  private async assertEmployeeIdAvailable(
    employeeId: string | null,
  ): Promise<void> {
    if (!employeeId) {
      return;
    }

    const existing = await this.prisma.user.findUnique({
      where: {
        employeeId,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        USER_MANAGEMENT_ERROR_CODE.EMPLOYEE_ID_ALREADY_EXISTS,
        'Employee ID already exists.',
      );
    }
  }

  private async cleanupUser(userId: string): Promise<void> {
    await this.prisma.user.deleteMany({
      where: {
        id: userId,
      },
    });
  }
}
